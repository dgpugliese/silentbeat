import { Hono } from 'hono';
import { SwitchTimer } from './do/SwitchTimer';
import { sweepExpired } from './cron';
import { auth } from './routes/auth';
import { switches } from './routes/switches';
import { checkins } from './routes/checkins';
import { recipients } from './routes/recipients';
import { log } from './routes/log';

export interface Env {
  DB: D1Database;
  PAYLOADS: R2Bucket;
  SESSIONS: KVNamespace;
  SWITCH_TIMER: DurableObjectNamespace;
  ASSETS: Fetcher;
  ENVIRONMENT: string;
  PUBLIC_BASE_URL: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => c.json({ ok: true, env: c.env.ENVIRONMENT }));

app.route('/api/auth', auth);
app.route('/api/switches', switches);
app.route('/api/switches', checkins);
app.route('/api/recipients', recipients);
app.route('/api/log', log);

app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
  scheduled: async (_event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(sweepExpired(env));
  },
};

export { SwitchTimer };
