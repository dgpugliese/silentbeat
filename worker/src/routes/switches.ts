import { Hono } from 'hono';
import type { Env } from '../index';
import { ulid } from '../lib/ulid';
import { hashPin, randomBytes, b64ToBytes, bytesToB64, aeadEncrypt, sha256Hex } from '../lib/crypto';
import { sendEmail } from '../lib/email';
import { append } from '../lib/auditlog';
import { requireUser } from './middleware';

export const switches = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
switches.use('*', requireUser);

switches.get('/', async (c) => {
  const userId = c.get('userId');
  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.status, s.expiry_at, s.last_checkin_at, s.timer_seconds, s.created_at,
            r.status AS recipient_status
     FROM switches s
     LEFT JOIN recipients r ON r.switch_id = s.id
     WHERE s.user_id = ?
     ORDER BY s.created_at DESC`,
  ).bind(userId).all();
  return c.json({ switches: results ?? [] });
});

switches.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{
    payloadCiphertextB64: string;
    payloadSizeBytes: number;
    shareAB64: string;          // 32-byte client-generated share. K = shareA XOR shareB.
    recipientEmail: string;
    timerSeconds: number;
    defusePin: string;
    duressPin: string;
  }>();

  if (body.timerSeconds < 86400 || body.timerSeconds > 5 * 365 * 86400) {
    return c.json({ error: 'timer out of range (24h–5y)' }, 400);
  }
  if (body.payloadSizeBytes > 50 * 1024 * 1024) {
    return c.json({ error: 'payload exceeds 50MB' }, 400);
  }
  if (body.defusePin === body.duressPin) {
    return c.json({ error: 'defuse and duress PINs must differ' }, 400);
  }
  if (!body.shareAB64) {
    return c.json({ error: 'shareAB64 required' }, 400);
  }
  const shareABytes = b64ToBytes(body.shareAB64);
  if (shareABytes.length !== 32) {
    return c.json({ error: 'shareAB64 must be 32 bytes' }, 400);
  }

  const switchId = ulid();
  const recipientId = ulid();
  const payloadKey = `payloads/${switchId}`;

  const enrollmentToken = bytesToB64(randomBytes(32)).replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
  const enrollmentTokenHash = await sha256Hex(enrollmentToken);

  const [defuse, duress] = await Promise.all([hashPin(body.defusePin), hashPin(body.duressPin)]);
  const flip = Math.random() < 0.5;
  const pair = flip ? [duress, defuse] : [defuse, duress];
  const duressSlot = flip ? 0 : 1;
  const pinHashSet = JSON.stringify({ hashes: pair });

  await c.env.PAYLOADS.put(payloadKey, b64ToBytes(body.payloadCiphertextB64));

  const emailBlob = await aeadEncrypt(c.env, new TextEncoder().encode(body.recipientEmail), new TextEncoder().encode(switchId));
  const duressBlob = await aeadEncrypt(c.env, new Uint8Array([duressSlot]), new TextEncoder().encode(switchId));

  const now = Date.now();
  const expiry = now + body.timerSeconds * 1000;

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO switches
       (id, user_id, payload_r2_key, payload_size_bytes, share_a, pin_hash_set_json, duress_slot_wrapped,
        expiry_at, timer_seconds, last_checkin_at, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    ).bind(switchId, userId, payloadKey, body.payloadSizeBytes, shareABytes, pinHashSet, duressBlob,
           expiry, body.timerSeconds, now, now),
    c.env.DB.prepare(
      `INSERT INTO recipients (id, switch_id, email_ct, email_iv, email_dek_wrapped, enrollment_token_hash, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    ).bind(recipientId, switchId, emailBlob,
           new Uint8Array(0),
           new Uint8Array(0),
           enrollmentTokenHash),
  ]);

  await append(c.env, switchId, 'switch_created');

  const enrollmentUrl = `${c.env.PUBLIC_BASE_URL}/enroll.html?r=${recipientId}&t=${enrollmentToken}`;
  await sendEmail(c.env, {
    to: body.recipientEmail,
    subject: 'Someone has named you as a SilentBeat recipient',
    text: [
      'A SilentBeat user has set up a switch and named you as the recipient.',
      '',
      'Before any switch can be armed, you have to enroll. Enrollment generates',
      'a keypair in your browser and gives you a rescue file. Save the rescue',
      'file — without it the message can never be decrypted.',
      '',
      'Enrollment link (single use):',
      enrollmentUrl,
      '',
      'If this seems wrong, ignore this email — the switch will not arm until you enroll.',
    ].join('\n'),
    html: `<p>A SilentBeat user named you as the recipient of a dead-man's-switch message.</p>
<p><a href="${enrollmentUrl}">Enroll now</a></p>
<p>Enrollment generates a keypair in your browser and gives you a rescue file. Save it — without it the message can never be decrypted.</p>`,
  });

  return c.json({
    switchId,
    recipientId,
    status: 'pending',
    needsFinalize: true,
    ...(c.env.ENVIRONMENT !== 'production' ? { dev_enrollment_url: enrollmentUrl } : {}),
  });
});

switches.get('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const sw = await c.env.DB.prepare(
    `SELECT s.id, s.status, s.expiry_at, s.last_checkin_at, s.timer_seconds, s.payload_size_bytes, s.created_at,
            r.id AS recipient_id, r.status AS recipient_status, r.pubkey_jwk_json
     FROM switches s
     LEFT JOIN recipients r ON r.switch_id = s.id
     WHERE s.id = ? AND s.user_id = ?`,
  ).bind(id, userId).first();
  if (!sw) return c.json({ error: 'not found' }, 404);
  return c.json({ switch: sw });
});

// Finalize: user provides the encrypted shareB blob (ECIES under recipient pubkey).
// Recipient must already be enrolled. After this, the switch arms.
switches.post('/:id/finalize', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const { encryptedShareBJson } = await c.req.json<{ encryptedShareBJson: string }>();
  if (!encryptedShareBJson) return c.json({ error: 'encryptedShareBJson required' }, 400);

  const sw = await c.env.DB.prepare(
    `SELECT id, status, expiry_at FROM switches WHERE id = ? AND user_id = ?`,
  ).bind(id, userId).first<{ id: string; status: string; expiry_at: number }>();
  if (!sw) return c.json({ error: 'not found' }, 404);
  if (sw.status !== 'pending') return c.json({ error: `status_${sw.status}` }, 409);

  const r = await c.env.DB.prepare(
    `SELECT id, status FROM recipients WHERE switch_id = ?`,
  ).bind(id).first<{ id: string; status: string }>();
  if (!r) return c.json({ error: 'recipient row missing' }, 500);
  if (r.status !== 'enrolled') return c.json({ error: 'recipient_not_enrolled' }, 409);

  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE recipients SET share_b_to_recipient = ?, status = 'test_confirmed' WHERE id = ?`,
    ).bind(encryptedShareBJson, r.id),
    c.env.DB.prepare(
      `UPDATE switches SET status = 'armed' WHERE id = ? AND status = 'pending'`,
    ).bind(id),
  ]);

  const stub = c.env.SWITCH_TIMER.get(c.env.SWITCH_TIMER.idFromName(id));
  await stub.fetch('https://do/arm', {
    method: 'POST',
    body: JSON.stringify({ switchId: id, expiryAt: sw.expiry_at }),
  }).catch(() => {});

  await append(c.env, id, 'switch_armed');
  return c.json({ ok: true, status: 'armed' });
});

switches.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const sw = await c.env.DB.prepare(
    `SELECT id, payload_r2_key, status FROM switches WHERE id = ? AND user_id = ?`,
  ).bind(id, userId).first<{ id: string; payload_r2_key: string; status: string }>();
  if (!sw) return c.json({ error: 'not found' }, 404);

  await c.env.PAYLOADS.delete(sw.payload_r2_key);
  await c.env.DB.prepare(
    `UPDATE switches SET status = 'user_purged' WHERE id = ?`,
  ).bind(id).run();

  const stub = c.env.SWITCH_TIMER.get(c.env.SWITCH_TIMER.idFromName(id));
  await stub.fetch('https://do/cancel', { method: 'POST' }).catch(() => {});

  await append(c.env, id, 'user_purge');
  return c.json({ ok: true });
});
