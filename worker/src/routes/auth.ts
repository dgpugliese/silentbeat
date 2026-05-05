import { Hono } from 'hono';
import type { Env } from '../index';
import { ulid } from '../lib/ulid';
import { sha256Hex, randomBytes, bytesToB64 } from '../lib/crypto';
import { createSession, destroySession, readBearer, readSession } from '../lib/session';

export const auth = new Hono<{ Bindings: Env }>();

// --- Passkey: Phase 3 will wire @simplewebauthn/server. Stubs here ---

auth.post('/passkey/register/begin', async (c) => {
  // TODO Phase 3: generate registration options, store challenge in KV
  return c.json({ stub: true, message: 'passkey registration not wired yet' }, 501);
});

auth.post('/passkey/register/finish', async (c) => {
  return c.json({ stub: true }, 501);
});

auth.post('/passkey/authenticate/begin', async (c) => {
  return c.json({ stub: true }, 501);
});

auth.post('/passkey/authenticate/finish', async (c) => {
  return c.json({ stub: true }, 501);
});

// --- Magic link (real, minimal) ---

auth.post('/magic/request', async (c) => {
  const { email } = await c.req.json<{ email: string }>();
  if (!email || !email.includes('@')) return c.json({ error: 'invalid email' }, 400);

  let user = await c.env.DB.prepare(`SELECT id FROM users WHERE email = ?`)
    .bind(email).first<{ id: string }>();
  if (!user) {
    const id = ulid();
    const now = Date.now();
    await c.env.DB.prepare(
      `INSERT INTO users (id, email, created_at, last_seen_at) VALUES (?, ?, ?, ?)`,
    ).bind(id, email, now, now).run();
    user = { id };
  }

  const tokenRaw = bytesToB64(randomBytes(32)).replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
  const tokenHash = await sha256Hex(tokenRaw);
  const expires = Date.now() + 15 * 60 * 1000;
  await c.env.DB.prepare(
    `INSERT INTO magic_tokens (id, user_id, token_hash, purpose, expires_at) VALUES (?, ?, ?, 'login', ?)`,
  ).bind(ulid(), user.id, tokenHash, expires).run();

  // TODO Phase 3: send email via Resend/Postmark.
  // For now, return the link directly in dev.
  const link = `${c.env.PUBLIC_BASE_URL}/api/auth/magic/consume?t=${tokenRaw}`;
  if (c.env.ENVIRONMENT === 'development') return c.json({ ok: true, dev_link: link });
  return c.json({ ok: true });
});

auth.get('/magic/consume', async (c) => {
  const t = c.req.query('t');
  if (!t) return c.text('missing token', 400);
  const tokenHash = await sha256Hex(t);
  const row = await c.env.DB.prepare(
    `SELECT id, user_id, expires_at, consumed_at FROM magic_tokens WHERE token_hash = ?`,
  ).bind(tokenHash).first<{ id: string; user_id: string; expires_at: number; consumed_at: number | null }>();
  if (!row) return c.text('invalid token', 400);
  if (row.consumed_at) return c.text('token already used', 400);
  if (row.expires_at < Date.now()) return c.text('token expired', 400);

  await c.env.DB.prepare(`UPDATE magic_tokens SET consumed_at = ? WHERE id = ?`)
    .bind(Date.now(), row.id).run();
  await c.env.DB.prepare(`UPDATE users SET last_seen_at = ? WHERE id = ?`)
    .bind(Date.now(), row.user_id).run();

  const session = await createSession(c.env, row.user_id);
  return c.html(
    `<!doctype html><meta charset=utf-8><title>signed in</title>
     <script>localStorage.setItem('sb_session','${session}');location.replace('/dashboard.html');</script>
     <p>signed in. <a href="/dashboard.html">continue</a></p>`,
  );
});

auth.post('/signout', async (c) => {
  const t = readBearer(c.req.raw);
  if (t) await destroySession(c.env, t);
  return c.json({ ok: true });
});

auth.get('/me', async (c) => {
  const t = readBearer(c.req.raw);
  if (!t) return c.json({ user: null });
  const session = await readSession(c.env, t);
  if (!session) return c.json({ user: null });
  const user = await c.env.DB.prepare(`SELECT id, email, created_at FROM users WHERE id = ?`)
    .bind(session.userId).first();
  return c.json({ user });
});
