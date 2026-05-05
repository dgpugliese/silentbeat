import type { Env } from '../index';
import { append } from '../lib/auditlog';

export class SwitchTimer {
  state: DurableObjectState;
  env: Env;
  switchId: string;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.switchId = state.id.name ?? state.id.toString();
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    switch (url.pathname) {
      case '/arm': {
        const { expiryAt } = await req.json<{ expiryAt: number }>();
        await this.state.storage.put('expiryAt', expiryAt);
        await this.state.storage.setAlarm(expiryAt);
        return Response.json({ ok: true });
      }
      case '/checkin': {
        const { newExpiryAt } = await req.json<{ newExpiryAt: number }>();
        await this.state.storage.put('expiryAt', newExpiryAt);
        await this.state.storage.setAlarm(newExpiryAt);
        return Response.json({ ok: true });
      }
      case '/cancel': {
        await this.state.storage.deleteAlarm();
        await this.state.storage.deleteAll();
        return Response.json({ ok: true });
      }
      case '/release': {
        // Backup path used by the cron sweeper when an alarm was missed.
        const result = await this.release();
        return Response.json(result);
      }
      default:
        return new Response('not found', { status: 404 });
    }
  }

  async alarm(): Promise<void> {
    await this.release();
  }

  /**
   * Idempotent release. Safe to call from alarm() OR from the cron sweeper.
   * Reads current status from D1; only releases if status is still 'armed'.
   * Phase 4 will plug in the real recipient-email send + payload-link assembly.
   */
  async release(): Promise<{ released: boolean; reason?: string }> {
    const sw = await this.env.DB.prepare(
      `SELECT id, status FROM switches WHERE id = ?`,
    ).bind(this.switchId).first<{ id: string; status: string }>();

    if (!sw) return { released: false, reason: 'switch_not_found' };
    if (sw.status !== 'armed') return { released: false, reason: `status_${sw.status}` };

    await this.env.DB.prepare(
      `UPDATE switches SET status = 'released' WHERE id = ? AND status = 'armed'`,
    ).bind(this.switchId).run();

    await append(this.env, this.switchId, 'release');
    await this.state.storage.deleteAlarm();
    // TODO Phase 4: send release email to recipient with shareA + ciphertext URL
    return { released: true };
  }
}
