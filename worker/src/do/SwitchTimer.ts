import type { Env } from '../index';
import { append } from '../lib/auditlog';
import { aeadDecrypt, bytesToB64, randomBytes, sha256Hex } from '../lib/crypto';
import { sendEmail } from '../lib/email';

// Phase 6: release ships shareA + the recipient-encrypted shareB blob and the
// payload URL. Recipient combines both shares locally (XOR) to reconstruct K and
// decrypts the payload. The server cannot decrypt unilaterally — this is the
// trust-model claim made on the landing page.

const enc = new TextEncoder();

export class SwitchTimer {
  state: DurableObjectState;
  env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    switch (url.pathname) {
      case '/arm': {
        const { switchId, expiryAt } = await req.json<{ switchId: string; expiryAt: number }>();
        await this.state.storage.put('switchId', switchId);
        await this.state.storage.put('expiryAt', expiryAt);
        await this.state.storage.setAlarm(expiryAt);
        return Response.json({ ok: true });
      }
      case '/checkin': {
        const { newExpiryAt } = await req.json<{ newExpiryAt: number }>();
        await this.state.storage.put('expiryAt', newExpiryAt);
        await this.state.storage.setAlarm(newExpiryAt);
        return Response.json({ ok: true });
      }
      case '/cancel': {
        await this.state.storage.deleteAlarm();
        await this.state.storage.deleteAll();
        return Response.json({ ok: true });
      }
      case '/release': {
        const body = await req.json<{ switchId?: string }>().catch(() => ({} as { switchId?: string }));
        const switchId = body.switchId ?? (await this.state.storage.get<string>('switchId'));
        if (!switchId) return Response.json({ released: false, reason: 'no_switch_id' });
        return Response.json(await this.release(switchId));
      }
      default:
        return new Response('not found', { status: 404 });
    }
  }

  async alarm(): Promise<void> {
    const switchId = await this.state.storage.get<string>('switchId');
    if (!switchId) return;
    await this.release(switchId);
  }

  async release(switchId: string): Promise<{ released: boolean; reason?: string }> {
    // Two flows:
    //   - new (account_recipient): email + envelope live on switches/account_recipients
    //   - legacy (per-switch recipient): email + envelope live on the recipients row
    const sw = await this.env.DB.prepare(
      `SELECT s.id, s.status, s.payload_r2_key, s.share_a,
              s.account_recipient_id, s.encrypted_share_b_json,
              r.email_ct AS legacy_email_ct,
              r.share_b_to_recipient AS legacy_share_b,
              ar.email_ct AS account_email_ct
       FROM switches s
       LEFT JOIN recipients r ON r.switch_id = s.id
       LEFT JOIN account_recipients ar ON ar.id = s.account_recipient_id
       WHERE s.id = ?`,
    ).bind(switchId).first<{
      id: string; status: string; payload_r2_key: string;
      share_a: ArrayBuffer;
      account_recipient_id: string | null;
      encrypted_share_b_json: string | null;
      legacy_email_ct: ArrayBuffer | null;
      legacy_share_b: string | null;
      account_email_ct: ArrayBuffer | null;
    }>();

    if (!sw) return { released: false, reason: 'switch_not_found' };
    if (sw.status !== 'armed') return { released: false, reason: `status_${sw.status}` };

    const isNewFlow = !!sw.account_recipient_id;
    const emailCtBuf = isNewFlow ? sw.account_email_ct : sw.legacy_email_ct;
    const encryptedShareB = isNewFlow ? sw.encrypted_share_b_json : sw.legacy_share_b;
    const aadString = isNewFlow ? sw.account_recipient_id! : switchId;
    if (!emailCtBuf || !encryptedShareB) {
      return { released: false, reason: 'recipient_incomplete' };
    }

    // Atomic state transition first; if email send fails after, the switch is
    // already 'released' (audit log written) and a follow-up cron pass will skip it.
    // This prefers "log says released" over "email actually sent" — which matches
    // the trust model (the public log is the source of truth).
    const update = await this.env.DB.prepare(
      `UPDATE switches SET status = 'released' WHERE id = ? AND status = 'armed'`,
    ).bind(switchId).run();
    if ((update.meta?.changes ?? 0) === 0) {
      return { released: false, reason: 'race_already_handled' };
    }

    const recipientEmail = new TextDecoder().decode(
      await aeadDecrypt(this.env, new Uint8Array(emailCtBuf), enc.encode(aadString)),
    );
    const shareAB64 = bytesToB64(new Uint8Array(sw.share_a));

    // One-time download token, 7-day TTL
    const tokenRaw = bytesToB64(randomBytes(32)).replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
    const tokenHash = await sha256Hex(tokenRaw);
    await this.env.SESSIONS.put(`release-token:${switchId}`, tokenHash, {
      expirationTtl: 7 * 86400,
    });
    const downloadUrl = `${this.env.PUBLIC_BASE_URL}/api/release/${switchId}/payload?t=${tokenRaw}`;
    // New-flow recipients (account_recipient) decrypt via passkey + PRF on /decrypt.html.
    // Legacy recipients still use /recipient.html with a rescue file.
    const decryptPage = isNewFlow ? '/decrypt.html' : '/recipient.html';
    const decryptUrl =
      `${this.env.PUBLIC_BASE_URL}${decryptPage}` +
      `?sid=${encodeURIComponent(switchId)}` +
      (isNewFlow ? `&rid=${encodeURIComponent(sw.account_recipient_id!)}` : '') +
      `&url=${encodeURIComponent(downloadUrl)}` +
      `&a=${encodeURIComponent(shareAB64)}` +
      `&b=${encodeURIComponent(encryptedShareB)}`;
    const verifyUrl = `${this.env.PUBLIC_BASE_URL}/log.html`;

    const newFlowText = [
      'A SilentBeat message has been released to you.',
      '',
      'The person who set this up did not check in before their timer expired.',
      'Their wishes were that you receive this message in that case.',
      '',
      'Open the link below on the device where you accepted their invitation. ',
      'Your phone or laptop will ask you to confirm with your passkey, and the message will appear.',
      '',
      decryptUrl,
      '',
      `Verify this release in the public log: ${verifyUrl}`,
      `Switch ID for cross-reference: ${switchId}`,
    ].join('\n');

    const legacyText = [
      'A SilentBeat message has been released to you.',
      '',
      'The user who set this up did not check in before their timer expired.',
      'Their wishes were that you receive this message in that case.',
      '',
      '── Decrypt with one click ──',
      decryptUrl,
      '',
      '── Or do it manually ──',
      '',
      'You will need your rescue file (the JSON the user sent you when you enrolled).',
      'Open https://silentbeat.app/recipient.html and paste:',
      '',
      '1. SERVER SHARE A (32 bytes, base64):',
      shareAB64,
      '',
      '2. ENCRYPTED RECIPIENT SHARE B (JSON, ECIES under your enrollment pubkey):',
      encryptedShareB,
      '',
      '3. ENCRYPTED PAYLOAD URL (single-use — the link works exactly once, save the file on first download):',
      downloadUrl,
      '',
      'The browser:',
      '  - reads your rescue private key',
      '  - decrypts share B with ECDH+AES-GCM',
      '  - XORs share A and share B → original AES key K',
      '  - downloads the encrypted payload, decrypts with K',
      'SilentBeat never sees the combined key.',
      '',
      `Verify this release in the public log: ${verifyUrl}`,
      `Switch ID for cross-reference: ${switchId}`,
    ].join('\n');

    const text = isNewFlow ? newFlowText : legacyText;

    const html = `<pre style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;line-height:1.55">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`;

    try {
      await sendEmail(this.env, {
        to: recipientEmail,
        subject: 'A SilentBeat message has been released to you.',
        text,
        html,
      });
    } catch (e) {
      // Email failed but D1 is already updated. Log and rely on operator alerting.
      console.error('[release] email send failed', switchId, e);
    }

    await append(this.env, switchId, 'release');
    await this.state.storage.deleteAlarm();
    return { released: true };
  }
}
