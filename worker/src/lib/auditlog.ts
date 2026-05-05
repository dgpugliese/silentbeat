import type { Env } from '../index';
import { sha256Hex, hmacSha256Hex } from './crypto';

export type AuditEvent =
  | 'switch_created'
  | 'switch_armed'
  | 'checkin'
  | 'release'
  | 'duress_release'
  | 'user_purge'
  | 'recipient_enrolled'
  | 'test_fire';

const PUBLIC_SALT = 'silentbeat-public-v1';

export async function append(env: Env, switchId: string, event: AuditEvent): Promise<void> {
  const at = Date.now();
  const switchIdHash = await hmacSha256Hex(PUBLIC_SALT, switchId);

  const last = await env.DB.prepare(
    `SELECT entry_hash FROM audit_log ORDER BY seq DESC LIMIT 1`,
  ).first<{ entry_hash: string }>();
  const prevHash = last?.entry_hash ?? '0'.repeat(64);

  const entryHash = await sha256Hex(`${prevHash}|${switchIdHash}|${event}|${at}`);
  // Phase 3: real Ed25519 signature over (seq||event||at||prev_hash||entry_hash)
  const placeholderSig = new Uint8Array(64);

  await env.DB.prepare(
    `INSERT INTO audit_log (switch_id_hash, event, at, prev_hash, entry_hash, signature)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(switchIdHash, event, at, prevHash, entryHash, placeholderSig).run();
}

export async function read(env: Env, limit = 100, beforeSeq?: number): Promise<unknown[]> {
  const stmt = beforeSeq
    ? env.DB.prepare(
        `SELECT seq, switch_id_hash, event, at, prev_hash, entry_hash
         FROM audit_log WHERE seq < ? ORDER BY seq DESC LIMIT ?`,
      ).bind(beforeSeq, limit)
    : env.DB.prepare(
        `SELECT seq, switch_id_hash, event, at, prev_hash, entry_hash
         FROM audit_log ORDER BY seq DESC LIMIT ?`,
      ).bind(limit);
  const { results } = await stmt.all();
  return results ?? [];
}
