import { Hono } from 'hono';
import type { Env } from '../index';
import { read } from '../lib/auditlog';
import { signEd25519, bytesToB64 } from '../lib/crypto';

export const log = new Hono<{ Bindings: Env }>();

const enc = new TextEncoder();

log.get('/', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? '100'), 500);
  const before = c.req.query('before') ? Number(c.req.query('before')) : undefined;
  const entries = await read(c.env, limit, before);
  return c.json({ entries });
});

log.get('/root', async (c) => {
  const last = await c.env.DB.prepare(
    `SELECT seq, entry_hash, at FROM audit_log ORDER BY seq DESC LIMIT 1`,
  ).first<{ seq: number; entry_hash: string; at: number }>();

  const seq = last?.seq ?? 0;
  const root = last?.entry_hash ?? '0'.repeat(64);
  const at = last?.at ?? 0;
  const checkpointAt = Date.now();

  // Detached signature over a stable canonical encoding of the checkpoint.
  const sigInput = enc.encode(`silentbeat-root-v1|${seq}|${root}|${at}|${checkpointAt}`);
  const signature = await signEd25519(c.env, sigInput);

  return c.json({
    seq,
    root,
    last_entry_at: at,
    checkpoint_at: checkpointAt,
    signature: bytesToB64(signature),
    public_key: c.env.LOG_PUBLIC_KEY,
    canonical_input: `silentbeat-root-v1|${seq}|${root}|${at}|${checkpointAt}`,
  });
});
