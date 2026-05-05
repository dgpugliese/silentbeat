import type { Context, Next } from 'hono';
import type { Env } from '../index';
import { readBearer, readSession } from '../lib/session';

declare module 'hono' {
  interface ContextVariableMap {
    userId: string;
  }
}

export async function requireUser(c: Context<{ Bindings: Env }>, next: Next) {
  const t = readBearer(c.req.raw);
  if (!t) return c.json({ error: 'unauthorized' }, 401);
  const session = await readSession(c.env, t);
  if (!session) return c.json({ error: 'unauthorized' }, 401);
  c.set('userId', session.userId);
  await next();
}
