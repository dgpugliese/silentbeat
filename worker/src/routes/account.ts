// Account-management routes: currently just deletion.
// Deletion cascades manually rather than relying on D1's CASCADE FKs so we can
// also cancel DO alarms, purge R2, and append a single 'account_deleted' audit
// event. SQLite FK CASCADE is on but we double up to keep DO + R2 in sync.

import { Hono } from 'hono';
import type { Env } from '../index';
import { append, appendUserScoped } from '../lib/auditlog';
import { destroySession, readBearer } from '../lib/session';
import { requireUser } from './middleware';

export const account = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

account.post('/delete', requireUser, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ confirm?: string }>().catch(() => ({} as { confirm?: string }));
  if (body.confirm !== 'DELETE') {
    return c.json({ error: 'must confirm with body { confirm: "DELETE" }' }, 400);
  }

  // 1) Cancel DO alarms + purge R2 for every switch this user owns.
  const { results: switchRows } = await c.env.DB.prepare(
    `SELECT id, payload_r2_key FROM switches WHERE user_id = ?`,
  ).bind(userId).all<{ id: string; payload_r2_key: string }>();

  for (const sw of switchRows ?? []) {
    try {
      const stub = c.env.SWITCH_TIMER.get(c.env.SWITCH_TIMER.idFromName(sw.id));
      await stub.fetch('https://do/cancel', { method: 'POST' });
    } catch {}
    try { await c.env.PAYLOADS.delete(sw.payload_r2_key); } catch {}
    try { await append(c.env, sw.id, 'user_purge'); } catch {}
  }

  // 2) Hard delete via SQLite cascade. switches/recipients/checkins/passkeys/magic_tokens
  //    all FK to users with ON DELETE CASCADE.
  await c.env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(userId).run();

  // 3) Pseudonymous account_deleted entry. switch_id_hash column is reused
  //    here with a different HMAC salt (audit_log doesn't distinguish — both
  //    are 64-char hex hashes; verifiers can compute either).
  await appendUserScoped(c.env, userId, 'account_deleted');

  // 4) Invalidate the current bearer.
  const t = readBearer(c.req.raw);
  if (t) await destroySession(c.env, t);

  return c.json({ ok: true });
});
