import { Hono } from 'hono';
import type { Env } from '../index';
import { SWEEPER_HEARTBEAT_KEY } from '../cron';

export const status = new Hono<{ Bindings: Env }>();

type PanelState = 'ok' | 'degraded' | 'down';

const SWEEPER_OK_MS = 10 * 60 * 1000;
const SWEEPER_DEGRADED_MS = 30 * 60 * 1000;
const AUDIT_OK_MS = 60 * 60 * 1000;
const AUDIT_DEGRADED_MS = 6 * 60 * 60 * 1000;

function ageState(ageMs: number | null, okMs: number, degradedMs: number): PanelState {
  if (ageMs === null) return 'down';
  if (ageMs <= okMs) return 'ok';
  if (ageMs <= degradedMs) return 'degraded';
  return 'down';
}

status.get('/pipeline', async (c) => {
  const now = Date.now();

  const lastEntry = await c.env.DB.prepare(
    `SELECT seq, at FROM audit_log ORDER BY seq DESC LIMIT 1`,
  ).first<{ seq: number; at: number }>().catch(() => null);

  const auditAge = lastEntry ? now - lastEntry.at : null;

  const sweeperRaw = await c.env.SESSIONS.get(SWEEPER_HEARTBEAT_KEY).catch(() => null);
  const sweeperAt = sweeperRaw ? Number(sweeperRaw) : null;
  const sweeperAge = sweeperAt ? now - sweeperAt : null;

  const lastDispatch = await c.env.DB.prepare(
    `SELECT at FROM audit_log
     WHERE event IN ('release', 'duress_release', 'recipient_enrolled')
     ORDER BY seq DESC LIMIT 1`,
  ).first<{ at: number }>().catch(() => null);

  const dispatchAge = lastDispatch ? now - lastDispatch.at : null;
  const emailConfigured = Boolean(c.env.RESEND_API_KEY);

  return c.json({
    as_of: now,
    audit_log: {
      state: ageState(auditAge, AUDIT_OK_MS, AUDIT_DEGRADED_MS),
      latest_entry_age_seconds: auditAge !== null ? Math.floor(auditAge / 1000) : null,
      seq: lastEntry?.seq ?? 0,
    },
    sweeper: {
      state: ageState(sweeperAge, SWEEPER_OK_MS, SWEEPER_DEGRADED_MS),
      last_run_age_seconds: sweeperAge !== null ? Math.floor(sweeperAge / 1000) : null,
    },
    email: {
      state: emailConfigured ? 'ok' : 'degraded' as PanelState,
      configured: emailConfigured,
      last_dispatch_age_seconds: dispatchAge !== null ? Math.floor(dispatchAge / 1000) : null,
    },
  });
});
