// Plan limits + enforcement. Single source of truth for what each tier can do.
// Server is the only place we trust to enforce; the UI uses these too but
// purely for visual hints.

import type { Env } from '../index';

export type Plan = 'free' | 'premium';

export interface PlanLimits {
  maxActiveSwitches: number;     // pending+armed; released/destroyed don't count
  maxPayloadBytes: number;
  maxTimerSeconds: number;
  apiAccess: boolean;            // Phase 12 feature, declared here for completeness
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    maxActiveSwitches: 1,
    maxPayloadBytes: 10 * 1024 * 1024,
    maxTimerSeconds: 30 * 86400,
    apiAccess: false,
  },
  premium: {
    maxActiveSwitches: 1000,         // sanity cap; "unlimited" in UX copy
    maxPayloadBytes: 50 * 1024 * 1024,
    maxTimerSeconds: 5 * 365 * 86400,
    apiAccess: true,
  },
};

// A user is 'premium' when plan='premium' AND the paid window hasn't elapsed.
// We re-check current_period_end so a stale row from a cancelled-without-webhook
// subscription doesn't keep paid privileges forever; the webhook is the
// authoritative path but defense-in-depth is cheap.
export async function getEffectivePlan(env: Env, userId: string): Promise<Plan> {
  const row = await env.DB.prepare(
    `SELECT plan, current_period_end FROM users WHERE id = ?`,
  ).bind(userId).first<{ plan: string; current_period_end: number | null }>();
  if (!row) return 'free';
  if (row.plan !== 'premium') return 'free';
  if (row.current_period_end && row.current_period_end < Date.now()) return 'free';
  return 'premium';
}

export async function getLimits(env: Env, userId: string): Promise<PlanLimits & { plan: Plan }> {
  const plan = await getEffectivePlan(env, userId);
  return { ...PLAN_LIMITS[plan], plan };
}

export async function countActiveSwitches(env: Env, userId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM switches
     WHERE user_id = ? AND status IN ('pending','armed')`,
  ).bind(userId).first<{ n: number }>();
  return row?.n ?? 0;
}
