import type { Env } from '../index';

export type AuditEvent =
  | 'switch_created'
  | 'switch_armed'
  | 'checkin'
  | 'release'
  | 'duress_release'
  | 'user_purge'
  | 'recipient_enrolled'
  | 'test_fire'
  | 'account_deleted';

// Routes every append through the singleton AuditLogger DO so the chain stays
// linear under concurrency. The DO is keyed by a fixed name so all appends
// across the worker share the same instance.
async function appendViaDO(env: Env, id: string, event: string, isUserId: boolean): Promise<void> {
  const stub = env.AUDIT_LOGGER.get(env.AUDIT_LOGGER.idFromName('audit-log'));
  const r = await stub.fetch('https://do/append', {
    method: 'POST',
    body: JSON.stringify({ id, event, isUserId }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '<no body>');
    throw new Error(`audit append failed: ${r.status} ${text}`);
  }
}

export async function append(env: Env, switchId: string, event: AuditEvent): Promise<void> {
  await appendViaDO(env, switchId, event, false);
}

// Used by account.ts for 'account_deleted'; HMAC salt is the user-id one
// rather than the switch-id one so the same column safely holds either.
export async function appendUserScoped(env: Env, userId: string, event: AuditEvent): Promise<void> {
  await appendViaDO(env, userId, event, true);
}

export async function read(env: Env, limit = 100, beforeSeq?: number): Promise<unknown[]> {
  const stmt = beforeSeq
    ? env.DB.prepare(
        `SELECT seq, switch_id_hash, event, at, prev_hash, entry_hash, signature
         FROM audit_log WHERE seq < ? ORDER BY seq DESC LIMIT ?`,
      ).bind(beforeSeq, limit)
    : env.DB.prepare(
        `SELECT seq, switch_id_hash, event, at, prev_hash, entry_hash, signature
         FROM audit_log ORDER BY seq DESC LIMIT ?`,
      ).bind(limit);
  const { results } = await stmt.all();
  return results ?? [];
}
