import { Hono } from 'hono';
import type { Env } from '../index';
import { ulid } from '../lib/ulid';
import { verifyPin, sha256Hex, aeadDecrypt } from '../lib/crypto';
import { append } from '../lib/auditlog';
import { sendEmail } from '../lib/email';
import { pinIsLocked, recordPinFailure, clearPinFailures } from '../lib/ratelimit';
import { requireUser } from './middleware';

export const checkins = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
checkins.use('*', requireUser);

interface PinHashSet {
  hashes: [string, string]; // PHC-encoded (salt + params embedded)
}

// Sends a plain notification to the recipient when a duress PIN fires.
// The payload is already purged at this point; there is nothing to decrypt.
// The recipient receives only the fact that the switch was triggered under
// duress, so they know the user wanted them to know something happened.
async function sendDuressNotification(env: Env, switchId: string): Promise<void> {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const row = await env.DB.prepare(
    `SELECT s.account_recipient_id,
            r.email_ct AS legacy_email_ct,
            ar.email_ct AS account_email_ct,
            ar.id      AS account_recipient_id_join
     FROM switches s
     LEFT JOIN recipients r ON r.switch_id = s.id
     LEFT JOIN account_recipients ar ON ar.id = s.account_recipient_id
     WHERE s.id = ?`,
  ).bind(switchId).first<{
    account_recipient_id: string | null;
    legacy_email_ct: ArrayBuffer | null;
    account_email_ct: ArrayBuffer | null;
    account_recipient_id_join: string | null;
  }>();
  if (!row) return;
  const isNewFlow = !!row.account_recipient_id;
  const emailCtBuf = isNewFlow ? row.account_email_ct : row.legacy_email_ct;
  const aad = isNewFlow ? row.account_recipient_id! : switchId;
  if (!emailCtBuf) return;
  const recipientEmail = dec.decode(await aeadDecrypt(env, new Uint8Array(emailCtBuf), enc.encode(aad)));

  const text = [
    'A SilentBeat switch you were named in has been triggered under duress.',
    '',
    'The user entered a duress PIN, which permanently destroys the encrypted',
    'payload. There is nothing for you to decrypt; the message no longer',
    'exists. The user wanted you to know that something happened.',
    '',
    `This event is recorded in our public log: ${env.PUBLIC_BASE_URL}/log.html`,
  ].join('\n');

  await sendEmail(env, {
    to: recipientEmail,
    subject: 'A SilentBeat switch was triggered under duress',
    text,
    html: `<pre style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;line-height:1.55">${text}</pre>`,
  });
}

checkins.post('/:id/checkin', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const { pin } = await c.req.json<{ pin: string }>();
  if (!/^\d{6}$/.test(pin)) return c.json({ error: 'invalid pin' }, 400);

  const sw = await c.env.DB.prepare(
    `SELECT id, status, timer_seconds, pin_hash_set_json, duress_slot_wrapped, payload_r2_key
     FROM switches WHERE id = ? AND user_id = ? AND status = 'armed'`,
  ).bind(id, userId).first<{
    id: string; status: string; timer_seconds: number;
    pin_hash_set_json: string; duress_slot_wrapped: ArrayBuffer; payload_r2_key: string;
  }>();
  if (!sw) return c.json({ error: 'switch not armed' }, 400);

  const ipHash = await sha256Hex(c.req.header('cf-connecting-ip') ?? '');
  const uaHash = await sha256Hex(c.req.header('user-agent') ?? '');

  if (await pinIsLocked(c.env, id, ipHash)) {
    return c.json({ error: 'too many wrong attempts; try again in an hour' }, 429);
  }

  const set = JSON.parse(sw.pin_hash_set_json) as PinHashSet;
  const slot0 = await verifyPin(pin, set.hashes[0]!);
  const slot1 = await verifyPin(pin, set.hashes[1]!);
  const matchedSlot = slot0 ? 0 : slot1 ? 1 : -1;
  if (matchedSlot === -1) {
    const { locked, recent } = await recordPinFailure(c.env, id, ipHash);
    return c.json({ error: locked ? 'locked' : 'wrong pin', attempts_in_window: recent }, 401);
  }
  await clearPinFailures(c.env, id, ipHash);

  const duressSlotBytes = await aeadDecrypt(c.env, new Uint8Array(sw.duress_slot_wrapped), new TextEncoder().encode(id));
  const isDuress = matchedSlot === duressSlotBytes[0];

  if (isDuress) {
    await c.env.PAYLOADS.delete(sw.payload_r2_key);
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE switches SET status = 'duress_purged' WHERE id = ?`).bind(id),
      c.env.DB.prepare(
        `INSERT INTO checkins (id, switch_id, kind, at, ip_hash, ua_hash) VALUES (?, ?, 'duress', ?, ?, ?)`,
      ).bind(ulid(), id, Date.now(), ipHash, uaHash),
    ]);
    const stub = c.env.SWITCH_TIMER.get(c.env.SWITCH_TIMER.idFromName(id));
    try { await stub.fetch('https://do/cancel', { method: 'POST' }); }
    catch (e) { console.error('[checkins.duress] DO cancel failed', id, e); }
    await append(c.env, id, 'duress_release');

    // Notify the recipient that the switch was triggered under duress.
    // Payload is already gone; there is nothing to decrypt. The recipient's role
    // here is purely to know the user wanted them to know something happened.
    await sendDuressNotification(c.env, id).catch((e) => {
      console.error('[checkins.duress] notification email failed', id, e);
    });

    return c.json({ result: 'released' });
  }

  // Defuse path. share_a stays fixed for the switch's lifetime — rotating it
  // would break decryption at release (recipient's encrypted shareB can only
  // combine back to the original K with the original shareA). Earlier code
  // here rotated it; that was a correctness bug. Only the timer + last
  // check-in advance.
  const expiryAt = Date.now() + sw.timer_seconds * 1000;
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE switches SET last_checkin_at = ?, expiry_at = ? WHERE id = ?`,
    ).bind(Date.now(), expiryAt, id),
    c.env.DB.prepare(
      `INSERT INTO checkins (id, switch_id, kind, at, ip_hash, ua_hash) VALUES (?, ?, 'defuse', ?, ?, ?)`,
    ).bind(ulid(), id, Date.now(), ipHash, uaHash),
  ]);

  const stub = c.env.SWITCH_TIMER.get(c.env.SWITCH_TIMER.idFromName(id));
  try {
    await stub.fetch('https://do/checkin', {
      method: 'POST',
      body: JSON.stringify({ newExpiryAt: expiryAt }),
    });
  } catch (e) {
    // Non-fatal: release() now guards against stale alarms by re-checking
    // expiry_at, so a missed RPC means at worst an extra no-op alarm firing.
    console.error('[checkins.defuse] DO checkin RPC failed', id, e);
  }

  await append(c.env, id, 'checkin');
  return c.json({ result: 'defused', expiryAt });
});
