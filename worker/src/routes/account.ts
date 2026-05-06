// Account-management routes: currently just deletion.
// Deletion cascades manually rather than relying on D1's CASCADE FKs so we can
// also cancel DO alarms, purge R2, and append a single 'account_deleted' audit
// event. SQLite FK CASCADE is on but we double up to keep DO + R2 in sync.

import { Hono } from 'hono';
import type { Env } from '../index';
import { append } from '../lib/auditlog';
import { hmacSha256Hex, sha256Hex, signEd25519, bytesToB64 } from '../lib/crypto';
import { destroySession, readBearer } from '../lib/session';
import { requireUser } from './middleware';

export const account = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

const PUBLIC_SALT_USERS = 'silentbeat-public-users-v1';
const enc = new TextEncoder();

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

  // 3) Pseudonymous account_deleted entry. The audit log uses switch_id_hash as a
  //    column name but we reuse it for hashed user_id here — same shape, same
  //    purpose (lets verifiers confirm we logged this without exposing identity).
  await appendAccountDeleted(c.env, userId);

  // 4) Invalidate the current bearer.
  const t = readBearer(c.req.raw);
  if (t) await destroySession(c.env, t);

  return c.json({ ok: true });
});

async function appendAccountDeleted(env: Env, userId: string): Promise<void> {
  const at = Date.now();
  const userIdHash = await hmacSha256Hex(PUBLIC_SALT_USERS, userId);

  const last = await env.DB.prepare(
    `SELECT seq, entry_hash FROM audit_log ORDER BY seq DESC LIMIT 1`,
  ).first<{ seq: number; entry_hash: string }>();
  const prevHash = last?.entry_hash ?? '0'.repeat(64);
  const seq = (last?.seq ?? 0) + 1;
  const event = 'account_deleted';

  const entryHash = await sha256Hex(`${prevHash}|${userIdHash}|${event}|${at}`);
  const sigInput = enc.encode(`${seq}|${event}|${at}|${prevHash}|${entryHash}`);
  const signature = await signEd25519(env, sigInput);

  await env.DB.prepare(
    `INSERT INTO audit_log (switch_id_hash, event, at, prev_hash, entry_hash, signature)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(userIdHash, event, at, prevHash, entryHash, signature).run();
}
