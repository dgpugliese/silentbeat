import type { Env } from './index';

export async function sweepExpired(env: Env): Promise<void> {
  const now = Date.now();
  const { results } = await env.DB.prepare(
    `SELECT id FROM switches WHERE status = 'armed' AND expiry_at <= ? LIMIT 100`,
  ).bind(now).all<{ id: string }>();

  for (const row of results ?? []) {
    const stub = env.SWITCH_TIMER.get(env.SWITCH_TIMER.idFromName(row.id));
    await stub.fetch('https://do/release', {
      method: 'POST',
      body: JSON.stringify({ switchId: row.id }),
    }).catch(() => {});
  }
}
