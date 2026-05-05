import { Hono } from 'hono';
import type { Env } from '../index';
import { append } from '../lib/auditlog';

export const recipients = new Hono<{ Bindings: Env }>();

// Recipient enrollment: public endpoint, gated by recipient ID + one-time enrollment token.
// Phase 3: replace token-in-URL with email-confirmed magic step.

recipients.post('/:id/enroll', async (c) => {
  const id = c.req.param('id');
  const { pubkeyJwk, shareBToRecipient } = await c.req.json<{
    pubkeyJwk: string;
    shareBToRecipient: string; // base64
  }>();

  const r = await c.env.DB.prepare(
    `SELECT id, switch_id, status FROM recipients WHERE id = ?`,
  ).bind(id).first<{ id: string; switch_id: string; status: string }>();
  if (!r) return c.json({ error: 'not found' }, 404);
  if (r.status !== 'pending') return c.json({ error: `already ${r.status}` }, 409);

  await c.env.DB.prepare(
    `UPDATE recipients
     SET pubkey_jwk_json = ?, share_b_to_recipient = ?, enrolled_at = ?, status = 'enrolled'
     WHERE id = ?`,
  ).bind(pubkeyJwk, shareBToRecipient, Date.now(), id).run();

  await append(c.env, r.switch_id, 'recipient_enrolled');
  return c.json({ ok: true, nextStep: 'test_fire' });
});

recipients.post('/:id/test-fire/confirm', async (c) => {
  const id = c.req.param('id');
  const r = await c.env.DB.prepare(
    `SELECT id, switch_id, status FROM recipients WHERE id = ?`,
  ).bind(id).first<{ id: string; switch_id: string; status: string }>();
  if (!r) return c.json({ error: 'not found' }, 404);
  if (r.status !== 'enrolled') return c.json({ error: `bad state: ${r.status}` }, 409);

  await c.env.DB.prepare(
    `UPDATE recipients SET test_fire_confirmed_at = ?, status = 'test_confirmed' WHERE id = ?`,
  ).bind(Date.now(), id).run();
  await c.env.DB.prepare(
    `UPDATE switches SET status = 'armed' WHERE id = ?`,
  ).bind(r.switch_id).run();

  // Set the alarm for the first time
  const sw = await c.env.DB.prepare(
    `SELECT expiry_at FROM switches WHERE id = ?`,
  ).bind(r.switch_id).first<{ expiry_at: number }>();
  if (sw) {
    const stub = c.env.SWITCH_TIMER.get(c.env.SWITCH_TIMER.idFromName(r.switch_id));
    await stub.fetch('https://do/arm', {
      method: 'POST',
      body: JSON.stringify({ expiryAt: sw.expiry_at }),
    }).catch(() => {});
  }

  await append(c.env, r.switch_id, 'test_fire');
  await append(c.env, r.switch_id, 'switch_armed');
  return c.json({ ok: true, status: 'armed' });
});
