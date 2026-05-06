import type { Env } from '../index';
import { sha256Hex, hmacSha256Hex, signEd25519 } from './crypto';

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

const PUBLIC_SALT = 'silentbeat-public-v1';
const enc = new TextEncoder();

export async function append(env: Env, switchId: string, event: AuditEvent): Promise<void> {
  const at = Date.now();
  const switchIdHash = await hmacSha256Hex(PUBLIC_SALT, switchId);

  const last = await env.DB.prepare(
    `SELECT seq, entry_hash FROM audit_log ORDER BY seq DESC LIMIT 1`,
  ).first<{ seq: number; entry_hash: string }>();
  const prevHash = last?.entry_hash ?? '0'.repeat(64);
  const seq = (last?.seq ?? 0) + 1;

  const entryHash = await sha256Hex(`${prevHash}|${switchIdHash}|${event}|${at}`);
  const sigInput = enc.encode(`${seq}|${event}|${at}|${prevHash}|${entryHash}`);
  const signature = await signEd25519(env, sigInput);

  await env.DB.prepare(
    `INSERT INTO audit_log (switch_id_hash, event, at, prev_hash, entry_hash, signature)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(switchIdHash, event, at, prevHash, entryHash, signature).run();
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
