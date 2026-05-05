import type { Env } from '../index';
import { append } from '../lib/auditlog';
import { aeadDecrypt, bytesToB64, randomBytes, sha256Hex } from '../lib/crypto';
import { sendEmail } from '../lib/email';

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
    const sw = await this.env.DB.prepare(
      `SELECT s.id, s.status, s.payload_r2_key, s.share_a, s.payload_key_wrapped,
              r.email_ct, r.share_b_to_recipient
       FROM switches s
       LEFT JOIN recipients r ON r.switch_id = s.id
       WHERE s.id = ?`,
    ).bind(switchId).first<{
      id: string; status: string; payload_r2_key: string;
      share_a: ArrayBuffer; payload_key_wrapped: ArrayBuffer | null;
      email_ct: ArrayBuffer | null; share_b_to_recipient: string | null;
    }>();

    if (!sw) return { released: false, reason: 'switch_not_found' };
    if (sw.status !== 'armed') return { released: false, reason: `status_${sw.status}` };
    if (!sw.email_ct || !sw.share_b_to_recipient) {
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
      await aeadDecrypt(this.env, new Uint8Array(sw.email_ct), enc.encode(switchId)),
    );
    const shareAB64 = bytesToB64(new Uint8Array(sw.share_a));
    const payloadKeyB64 = sw.payload_key_wrapped
      ? bytesToB64(await aeadDecrypt(this.env, new Uint8Array(sw.payload_key_wrapped), enc.encode(switchId)))
      : '(unavailable — switch predates payload-key wrapping)';

    // One-time download token, 7-day TTL
    const tokenRaw = bytesToB64(randomBytes(32)).replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
    const tokenHash = await sha256Hex(tokenRaw);
    await this.env.SESSIONS.put(`release-token:${switchId}`, tokenHash, {
      expirationTtl: 7 * 86400,
    });
    const downloadUrl = `${this.env.PUBLIC_BASE_URL}/api/release/${switchId}/payload?t=${tokenRaw}`;
    const verifyUrl = `${this.env.PUBLIC_BASE_URL}/log.html`;

    const text = [
      'A SilentBeat message has been released to you.',
      '',
      `The user who set this up did not check in before their timer expired.`,
      'Their wishes were that you receive this message in that case.',
      '',
      'Decrypt steps:',
      '',
      '1. PAYLOAD AES-GCM KEY (32 bytes, base64) — keep this local:',
      payloadKeyB64,
      '',
      '2. ENCRYPTED PAYLOAD — download once, save locally:',
      downloadUrl,
      '',
      '3. Decrypt locally with the recipient.html → "decrypt" tool, or any AES-GCM-256',
      '   tool that reads iv (first 12 bytes) || ciphertext || tag (last 16 bytes).',
      '',
      `Verify this release in the public log: ${verifyUrl}`,
      `Switch ID for cross-reference: ${switchId}`,
      '',
      '— diagnostic fields below; ignore unless asked —',
      `server share A (b64): ${shareAB64}`,
      `recipient share B (encrypted to enrollment pubkey): ${sw.share_b_to_recipient ?? '(none)'}`,
    ].join('\n');

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
