import type { Env } from '../index';
import { randomBytes, bytesToB64 } from './crypto';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface Session {
  userId: string;
  createdAt: number;
}

// Bearer tokens are 32 random bytes (256 bits) as a base64url string. ULID
// gave us only ~80 bits of randomness which is below NIST SP 800-63B
// requirements for opaque session identifiers.
function newToken(): string {
  return bytesToB64(randomBytes(32))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function createSession(env: Env, userId: string): Promise<string> {
  const token = newToken();
  const session: Session = { userId, createdAt: Date.now() };
  await env.SESSIONS.put(`s:${token}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
  return token;
}

export async function readSession(env: Env, token: string): Promise<Session | null> {
  const raw = await env.SESSIONS.get(`s:${token}`);
  return raw ? (JSON.parse(raw) as Session) : null;
}

export async function destroySession(env: Env, token: string): Promise<void> {
  await env.SESSIONS.delete(`s:${token}`);
}

export function readBearer(req: Request): string | null {
  const h = req.headers.get('authorization');
  if (!h?.startsWith('Bearer ')) return null;
  return h.slice(7);
}
