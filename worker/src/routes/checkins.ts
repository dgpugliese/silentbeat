import { Hono } from 'hono';
import type { Env } from '../index';
import { ulid } from '../lib/ulid';
import { verifyPin, randomBytes, sha256Hex, aeadDecrypt } from '../lib/crypto';
import { append } from '../lib/auditlog';
import { requireUser } from './middleware';

export const checkins = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
checkins.use('*', requireUser);

interface PinHashSet {
  hashes: [string, string];
  salts: [string, string];
}

checkins.post('/:id/checkin', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const { pin } = await c.req.json<{ pin: string }>();
  if (!/^\d{6,}$/.test(pin)) return c.json({ error: 'invalid pin' }, 400);

  const sw = await c.env.DB.prepare(
    `SELECT id, status, timer_seconds, pin_hash_set_json, duress_slot_wrapped, payload_r2_key
     FROM switches WHERE id = ? AND user_id = ? AND status = 'armed'`,
  ).bind(id, userId).first<{
    id: string; status: string; timer_seconds: number;
    pin_hash_set_json: string; duress_slot_wrapped: ArrayBuffer; payload_r2_key: string;
  }>();
  if (!sw) return c.json({ error: 'switch not armed' }, 400);

  const set = JSON.parse(sw.pin_hash_set_json) as PinHashSet;
  // Try both slots in constant order; the matching slot tells us defuse vs duress
  // by comparing to duress_slot, which we unwrap from a master-key-protected blob.
  const slot0 = await verifyPin(pin, set.hashes[0]!, set.salts[0]!);
  const slot1 = await verifyPin(pin, set.hashes[1]!, set.salts[1]!);
  const matchedSlot = slot0 ? 0 : slot1 ? 1 : -1;
  if (matchedSlot === -1) {
    // TODO Phase 3: increment failure counter, lock after 5/h
    return c.json({ error: 'wrong pin' }, 401);
  }
  const duressSlotBytes = await aeadDecrypt(c.env, new Uint8Array(sw.duress_slot_wrapped), new TextEncoder().encode(id));
  const isDuress = matchedSlot === duressSlotBytes[0];

  const ipHash = await sha256Hex(c.req.header('cf-connecting-ip') ?? '');
  const uaHash = await sha256Hex(c.req.header('user-agent') ?? '');

  if (isDuress) {
    await c.env.PAYLOADS.delete(sw.payload_r2_key);
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE switches SET status = 'duress_purged' WHERE id = ?`).bind(id),
      c.env.DB.prepare(
        `INSERT INTO checkins (id, switch_id, kind, at, ip_hash, ua_hash) VALUES (?, ?, 'duress', ?, ?, ?)`,
      ).bind(ulid(), id, Date.now(), ipHash, uaHash),
    ]);
    const stub = c.env.SWITCH_TIMER.get(c.env.SWITCH_TIMER.idFromName(id));
    await stub.fetch('https://do/cancel', { method: 'POST' }).catch(() => {});
    await append(c.env, id, 'duress_release');
    // TODO Phase 4: trigger duress email to recipient (server share + bare keys; payload already gone)
    return c.json({ result: 'released' });
  }

  // Defuse path
  const newShareA = randomBytes(32);
  const expiryAt = Date.now() + sw.timer_seconds * 1000;
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE switches SET share_a = ?, last_checkin_at = ?, expiry_at = ? WHERE id = ?`,
    ).bind(newShareA, Date.now(), expiryAt, id),
    c.env.DB.prepare(
      `INSERT INTO checkins (id, switch_id, kind, at, ip_hash, ua_hash) VALUES (?, ?, 'defuse', ?, ?, ?)`,
    ).bind(ulid(), id, Date.now(), ipHash, uaHash),
  ]);

  const stub = c.env.SWITCH_TIMER.get(c.env.SWITCH_TIMER.idFromName(id));
  await stub.fetch('https://do/checkin', {
    method: 'POST',
    body: JSON.stringify({ newExpiryAt: expiryAt }),
  }).catch(() => {});

  await append(c.env, id, 'checkin');
  return c.json({ result: 'defused', expiryAt });
});
