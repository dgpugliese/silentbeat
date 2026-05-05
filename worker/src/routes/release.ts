// Release download endpoint — public, gated by single-use token issued by the
// DO at release time and stored in KV with a 7-day TTL.

import { Hono } from 'hono';
import type { Env } from '../index';
import { sha256Hex, constantTimeEqual } from '../lib/crypto';

export const release = new Hono<{ Bindings: Env }>();

// Dev-only: manually trigger the DO release path for a specific switch.
// Useful for verifying email composition + token flow without waiting for cron.
release.post('/_dev/trigger/:switchId', async (c) => {
  if (c.env.ENVIRONMENT !== 'development') return c.text('dev only', 404);
  const switchId = c.req.param('switchId');
  const stub = c.env.SWITCH_TIMER.get(c.env.SWITCH_TIMER.idFromName(switchId));
  const r = await stub.fetch('https://do/release', {
    method: 'POST',
    body: JSON.stringify({ switchId }),
  });
  return new Response(r.body, { status: r.status, headers: r.headers });
});

release.get('/:switchId/payload', async (c) => {
  const switchId = c.req.param('switchId');
  const t = c.req.query('t');
  if (!t) return c.text('missing token', 400);

  const tHash = await sha256Hex(t);
  const stored = await c.env.SESSIONS.get(`release-token:${switchId}`);
  if (!stored) return c.text('expired or unknown', 404);
  if (!constantTimeEqual(stored, tHash)) return c.text('invalid token', 401);

  const obj = await c.env.PAYLOADS.get(`payloads/${switchId}`);
  if (!obj) return c.text('payload not found (possibly purged)', 404);

  return new Response(obj.body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="silentbeat-${switchId}.bin"`,
      'Cache-Control': 'no-store',
    },
  });
});
