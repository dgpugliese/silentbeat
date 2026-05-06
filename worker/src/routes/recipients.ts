import { Hono } from 'hono';
import type { Env } from '../index';
import { append } from '../lib/auditlog';
import { sha256Hex } from '../lib/crypto';

export const recipients = new Hono<{ Bindings: Env }>();

// Recipient enrollment: public endpoint, gated by recipient ID + one-time enrollment token.
// Token is generated at switch-creation time, sent to the recipient via email (Phase 4),
// and stored only as a SHA-256 hash. Without this token the endpoint refuses.

recipients.post('/:id/enroll', async (c) => {
  const id = c.req.param('id');
  const { pubkeyJwk, enrollmentToken } = await c.req.json<{
    pubkeyJwk: string;        // recipient's enrollment public key (P-256 ECDH JWK), JSON-stringified
    enrollmentToken: string;
  }>();
  if (!enrollmentToken) return c.json({ error: 'missing enrollment token' }, 400);
  if (!pubkeyJwk) return c.json({ error: 'pubkeyJwk required' }, 400);

  const r = await c.env.DB.prepare(
    `SELECT id, switch_id, status, enrollment_token_hash, enrollment_token_consumed_at
     FROM recipients WHERE id = ?`,
  ).bind(id).first<{
    id: string; switch_id: string; status: string;
    enrollment_token_hash: string | null; enrollment_token_consumed_at: number | null;
  }>();
  if (!r) return c.json({ error: 'not found' }, 404);
  if (r.status !== 'pending') return c.json({ error: `already ${r.status}` }, 409);
  if (!r.enrollment_token_hash) return c.json({ error: 'token not provisioned' }, 500);
  if (r.enrollment_token_consumed_at) return c.json({ error: 'token already used' }, 409);

  const tokenHash = await sha256Hex(enrollmentToken);
  // Constant-time-ish compare via length-and-XOR
  if (tokenHash.length !== r.enrollment_token_hash.length) return c.json({ error: 'invalid token' }, 401);
  let diff = 0;
  for (let i = 0; i < tokenHash.length; i++) diff |= tokenHash.charCodeAt(i) ^ r.enrollment_token_hash.charCodeAt(i);
  if (diff !== 0) return c.json({ error: 'invalid token' }, 401);

  await c.env.DB.prepare(
    `UPDATE recipients
     SET pubkey_jwk_json = ?, enrolled_at = ?, enrollment_token_consumed_at = ?, status = 'enrolled'
     WHERE id = ?`,
  ).bind(pubkeyJwk, Date.now(), Date.now(), id).run();

  await append(c.env, r.switch_id, 'recipient_enrolled');
  // Next step: the user (switch creator) calls POST /api/switches/:id/finalize
  // with shareB encrypted to this recipient's pubkey. After that, the switch arms.
  return c.json({ ok: true, nextStep: 'user_finalize' });
});
