import type { Env } from '../index';
import { ulid } from './ulid';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface Session {
  userId: string;
  createdAt: number;
}

export async function createSession(env: Env, userId: string): Promise<string> {
  const token = ulid();
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
