import { Hono } from 'hono';
import { SwitchTimer } from './do/SwitchTimer';
import { AuditLogger } from './do/AuditLogger';
import { sweepExpired } from './cron';
import { auth } from './routes/auth';
import { account } from './routes/account';
import { accountRecipients } from './routes/account_recipients';
import { recipientEnroll } from './routes/recipient_enroll';
import { switches } from './routes/switches';
import { checkins } from './routes/checkins';
import { recipients } from './routes/recipients';
import { log } from './routes/log';
import { release } from './routes/release';

export interface Env {
  DB: D1Database;
  PAYLOADS: R2Bucket;
  SESSIONS: KVNamespace;
  SWITCH_TIMER: DurableObjectNamespace;
  AUDIT_LOGGER: DurableObjectNamespace;
  ASSETS: Fetcher;
  ENVIRONMENT: string;
  PUBLIC_BASE_URL: string;
  RP_ID: string;
  RP_NAME: string;
  RP_ORIGIN: string;
  EMAIL_FROM: string;
  // Secrets — provisioned via `wrangler secret put` for prod; .dev.vars for dev.
  MASTER_KEY: string;
  LOG_SIGNING_KEY: string;
  LOG_PUBLIC_KEY: string;
  RESEND_API_KEY?: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => c.json({ ok: true, env: c.env.ENVIRONMENT }));

app.route('/api/auth', auth);
app.route('/api/account', account);
app.route('/api/account/recipients', accountRecipients);
app.route('/api/recipients-anon', recipientEnroll);
app.route('/api/switches', switches);
app.route('/api/switches', checkins);
app.route('/api/recipients', recipients);
app.route('/api/log', log);
app.route('/api/release', release);

app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
  scheduled: async (_event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(sweepExpired(env));
  },
};

export { SwitchTimer, AuditLogger };
