// KV-backed sliding-window rate limiter for PIN attempts.
// Window: 1 hour. Threshold: 5. Lockout = next attempt rejected with `locked`.

import type { Env } from '../index';

const WINDOW_MS = 3600_000;
const THRESHOLD = 5;
const KV_TTL_S = 3600;

function key(switchId: string, ipHash: string): string {
  return `pin-fail:${switchId}:${ipHash}`;
}

export async function pinIsLocked(env: Env, switchId: string, ipHash: string): Promise<boolean> {
  const raw = await env.SESSIONS.get(key(switchId, ipHash));
  if (!raw) return false;
  const fails = JSON.parse(raw) as number[];
  const recent = fails.filter((t) => Date.now() - t < WINDOW_MS);
  return recent.length >= THRESHOLD;
}

export async function recordPinFailure(env: Env, switchId: string, ipHash: string): Promise<{ locked: boolean; recent: number }> {
  const k = key(switchId, ipHash);
  const raw = await env.SESSIONS.get(k);
  const fails = (raw ? JSON.parse(raw) : []) as number[];
  const recent = fails.filter((t) => Date.now() - t < WINDOW_MS);
  recent.push(Date.now());
  await env.SESSIONS.put(k, JSON.stringify(recent), { expirationTtl: KV_TTL_S });
  return { locked: recent.length >= THRESHOLD, recent: recent.length };
}

export async function clearPinFailures(env: Env, switchId: string, ipHash: string): Promise<void> {
  await env.SESSIONS.delete(key(switchId, ipHash));
}
