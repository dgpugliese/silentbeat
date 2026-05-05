import { Hono } from 'hono';
import type { Env } from '../index';
import { ulid } from '../lib/ulid';
import { hashPin, randomBytes, b64ToBytes, aeadEncrypt } from '../lib/crypto';
import { append } from '../lib/auditlog';
import { requireUser } from './middleware';

export const switches = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
switches.use('*', requireUser);

switches.get('/', async (c) => {
  const userId = c.get('userId');
  const { results } = await c.env.DB.prepare(
    `SELECT id, status, expiry_at, last_checkin_at, timer_seconds, created_at
     FROM switches WHERE user_id = ? ORDER BY created_at DESC`,
  ).bind(userId).all();
  return c.json({ switches: results ?? [] });
});

switches.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{
    payloadCiphertextB64: string;
    payloadSizeBytes: number;
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

  const switchId = ulid();
  const recipientId = ulid();
  const payloadKey = `payloads/${switchId}`;
  const shareA = randomBytes(32);

  const [defuse, duress] = await Promise.all([hashPin(body.defusePin), hashPin(body.duressPin)]);
  const flip = Math.random() < 0.5;
  const pair = flip ? [duress, defuse] : [defuse, duress];
  const duressSlot = flip ? 0 : 1;
  const pinHashSet = JSON.stringify({ hashes: pair.map((p) => p.hash), salts: pair.map((p) => p.salt) });

  await c.env.PAYLOADS.put(payloadKey, b64ToBytes(body.payloadCiphertextB64));

  // Encrypt recipient email under the master key; bind to switch ID via AAD.
  const emailBlob = await aeadEncrypt(c.env, new TextEncoder().encode(body.recipientEmail), new TextEncoder().encode(switchId));
  // Wrap the duress-slot bit so a DB-only dump can't tell defuse from duress.
  const duressBlob = await aeadEncrypt(c.env, new Uint8Array([duressSlot]), new TextEncoder().encode(switchId));

  const now = Date.now();
  const expiry = now + body.timerSeconds * 1000;

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO switches
       (id, user_id, payload_r2_key, payload_size_bytes, share_a, pin_hash_set_json, duress_slot, duress_slot_wrapped,
        expiry_at, timer_seconds, last_checkin_at, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    ).bind(switchId, userId, payloadKey, body.payloadSizeBytes, shareA, pinHashSet,
           // Legacy `duress_slot` int column kept NOT NULL by 0001; populated with dummy
           // (real value lives wrapped). 0002 will drop this column once 0001 is rebased pre-deploy.
           0, duressBlob,
           expiry, body.timerSeconds, now, now),
    c.env.DB.prepare(
      `INSERT INTO recipients (id, switch_id, email_ct, email_iv, email_dek_wrapped, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
    ).bind(recipientId, switchId, emailBlob,
           new Uint8Array(0), // iv inlined into emailBlob; column kept for schema compat
           new Uint8Array(0)),
  ]);

  await append(c.env, switchId, 'switch_created');

  // TODO: send recipient enrollment email
  return c.json({ switchId, recipientId, status: 'pending', enrollmentRequired: true });
});

switches.get('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const sw = await c.env.DB.prepare(
    `SELECT id, status, expiry_at, last_checkin_at, timer_seconds, payload_size_bytes, created_at
     FROM switches WHERE id = ? AND user_id = ?`,
  ).bind(id, userId).first();
  if (!sw) return c.json({ error: 'not found' }, 404);
  return c.json({ switch: sw });
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

  // Cancel DO alarm
  const stub = c.env.SWITCH_TIMER.get(c.env.SWITCH_TIMER.idFromName(id));
  await stub.fetch('https://do/cancel', { method: 'POST' }).catch(() => {});

  await append(c.env, id, 'user_purge');
  return c.json({ ok: true });
});
