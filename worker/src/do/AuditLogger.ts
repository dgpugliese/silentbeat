// Singleton Durable Object that serializes all audit_log appends.
//
// Why this exists: the prior auditlog.append() did SELECT-then-INSERT against
// D1 with no serialization. Two concurrent requests could both read the same
// last row, both compute prev_hash from it, and both insert. They'd get
// distinct seq values from AUTOINCREMENT but their prev_hash references would
// collide — the chain becomes ambiguous.
//
// DOs are single-threaded per ID. By routing every append through one DO
// instance ('audit-log'), reads and writes are strictly ordered and
// prev_hash references the row that immediately precedes the new one.

import type { Env } from '../index';
import { sha256Hex, hmacSha256Hex, signEd25519 } from '../lib/crypto';

const PUBLIC_SALT = 'silentbeat-public-v1';
const PUBLIC_SALT_USERS = 'silentbeat-public-users-v1';
const enc = new TextEncoder();

interface AppendInput {
  // For switch-scoped events the caller passes (switchId, event).
  // For user-scoped events ('account_deleted') the caller passes
  // (userId, event, isUserId=true) so we use the user-id HMAC salt.
  id: string;
  event: string;
  isUserId?: boolean;
}

export class AuditLogger {
  state: DurableObjectState;
  env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== '/append' || req.method !== 'POST') {
      return new Response('not found', { status: 404 });
    }
    const body = await req.json<AppendInput>();
    if (!body || typeof body.id !== 'string' || typeof body.event !== 'string') {
      return Response.json({ error: 'bad_input' }, { status: 400 });
    }

    // state.blockConcurrencyWhile is the canonical "I need exclusive access
    // for this critical section" primitive in DOs. Even though DOs are
    // single-threaded, awaits inside a handler can be interleaved with
    // alarm fires; this guarantees nothing else runs in this DO until we're
    // done.
    return await this.state.blockConcurrencyWhile(async () => {
      const at = Date.now();
      const salt = body.isUserId ? PUBLIC_SALT_USERS : PUBLIC_SALT;
      const idHash = await hmacSha256Hex(salt, body.id);

      const last = await this.env.DB.prepare(
        `SELECT seq, entry_hash FROM audit_log ORDER BY seq DESC LIMIT 1`,
      ).first<{ seq: number; entry_hash: string }>();
      const prevHash = last?.entry_hash ?? '0'.repeat(64);
      const seq = (last?.seq ?? 0) + 1;

      const entryHash = await sha256Hex(`${prevHash}|${idHash}|${body.event}|${at}`);
      const sigInput = enc.encode(`${seq}|${body.event}|${at}|${prevHash}|${entryHash}`);
      const signature = await signEd25519(this.env, sigInput);

      await this.env.DB.prepare(
        `INSERT INTO audit_log (switch_id_hash, event, at, prev_hash, entry_hash, signature)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(idHash, body.event, at, prevHash, entryHash, signature).run();

      return Response.json({ ok: true, seq, entry_hash: entryHash });
    });
  }
}
