import { Hono } from 'hono';
import type { Env } from '../index';
import { read } from '../lib/auditlog';

export const log = new Hono<{ Bindings: Env }>();

log.get('/', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? '100'), 500);
  const before = c.req.query('before') ? Number(c.req.query('before')) : undefined;
  const entries = await read(c.env, limit, before);
  return c.json({ entries });
});

log.get('/root', async (c) => {
  const last = await c.env.DB.prepare(
    `SELECT seq, entry_hash FROM audit_log ORDER BY seq DESC LIMIT 1`,
  ).first<{ seq: number; entry_hash: string }>();
  return c.json({
    seq: last?.seq ?? 0,
    root: last?.entry_hash ?? '0'.repeat(64),
    // Phase 3: detached Ed25519 signature over root + seq
    signature: null,
    publicKey: null,
  });
});
