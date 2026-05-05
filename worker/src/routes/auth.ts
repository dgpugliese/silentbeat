import { Hono } from 'hono';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type { Env } from '../index';
import { ulid } from '../lib/ulid';
import { sha256Hex, randomBytes, bytesToB64 } from '../lib/crypto';
import { createSession, destroySession, readBearer, readSession } from '../lib/session';
import { sendEmail } from '../lib/email';
import { requireUser } from './middleware';

export const auth = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

const enc = new TextEncoder();
const CHAL_TTL = 300;

// --- Magic link ---

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

  const link = `${c.env.PUBLIC_BASE_URL}/api/auth/magic/consume?t=${tokenRaw}`;
  await sendEmail(c.env, {
    to: email,
    subject: 'Your SilentBeat sign-in link',
    text: `Click to sign in to SilentBeat:\n\n${link}\n\nLink expires in 15 minutes. If you did not request this, ignore this email.`,
    html: `<p>Click to sign in to SilentBeat:</p><p><a href="${link}">${link}</a></p><p>Link expires in 15 minutes. If you did not request this, ignore this email.</p>`,
  });
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

// --- Passkey registration (requires existing session) ---

auth.post('/passkey/register/begin', requireUser, async (c) => {
  const userId = c.get('userId');
  const user = await c.env.DB.prepare(`SELECT id, email FROM users WHERE id = ?`)
    .bind(userId).first<{ id: string; email: string }>();
  if (!user) return c.json({ error: 'no user' }, 404);

  const { results } = await c.env.DB.prepare(
    `SELECT credential_id, transports FROM passkey_credentials WHERE user_id = ?`,
  ).bind(userId).all<{ credential_id: string; transports: string | null }>();

  const excludeCredentials = (results ?? []).map((r) => ({
    id: r.credential_id,
    transports: (r.transports ?? '').split(',').filter(Boolean) as AuthenticatorTransportFuture[],
  }));

  const options = await generateRegistrationOptions({
    rpName: c.env.RP_NAME,
    rpID: c.env.RP_ID,
    userName: user.email,
    userID: enc.encode(user.id),
    attestationType: 'none',
    excludeCredentials,
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });

  await c.env.SESSIONS.put(`pk-reg-chal:${userId}`, options.challenge, { expirationTtl: CHAL_TTL });
  return c.json(options);
});

auth.post('/passkey/register/finish', requireUser, async (c) => {
  const userId = c.get('userId');
  const response = await c.req.json();
  const challenge = await c.env.SESSIONS.get(`pk-reg-chal:${userId}`);
  if (!challenge) return c.json({ error: 'no challenge' }, 400);

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: c.env.RP_ORIGIN,
    expectedRPID: c.env.RP_ID,
  });
  if (!verification.verified || !verification.registrationInfo) {
    return c.json({ error: 'verification failed' }, 400);
  }

  const { credentialID, credentialPublicKey, counter, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const transports = (response?.response?.transports ?? []).join(',');

  await c.env.DB.prepare(
    `INSERT INTO passkey_credentials
     (credential_id, user_id, public_key, counter, transports, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(
    credentialID,
    userId,
    credentialPublicKey,
    counter,
    transports,
    Date.now(),
  ).run();

  await c.env.SESSIONS.delete(`pk-reg-chal:${userId}`);
  return c.json({ ok: true, credentialDeviceType, credentialBackedUp });
});

// --- Passkey authentication (no prior session) ---

auth.post('/passkey/authenticate/begin', async (c) => {
  const body = await c.req.json<{ email?: string }>().catch(() => ({} as { email?: string }));

  let allowCredentials: Array<{ id: string; transports?: AuthenticatorTransportFuture[] }> | undefined;
  if (body.email) {
    const user = await c.env.DB.prepare(`SELECT id FROM users WHERE email = ?`)
      .bind(body.email).first<{ id: string }>();
    if (user) {
      const { results } = await c.env.DB.prepare(
        `SELECT credential_id, transports FROM passkey_credentials WHERE user_id = ?`,
      ).bind(user.id).all<{ credential_id: string; transports: string | null }>();
      allowCredentials = (results ?? []).map((r) => ({
        id: r.credential_id,
        transports: (r.transports ?? '').split(',').filter(Boolean) as AuthenticatorTransportFuture[],
      }));
    }
  }

  const options = await generateAuthenticationOptions({
    rpID: c.env.RP_ID,
    allowCredentials,
    userVerification: 'preferred',
  });

  const challengeId = ulid();
  await c.env.SESSIONS.put(`pk-auth-chal:${challengeId}`, options.challenge, { expirationTtl: CHAL_TTL });
  return c.json({ ...options, challengeId });
});

auth.post('/passkey/authenticate/finish', async (c) => {
  const { response, challengeId } = await c.req.json<{ response: any; challengeId: string }>();
  const challenge = await c.env.SESSIONS.get(`pk-auth-chal:${challengeId}`);
  if (!challenge) return c.json({ error: 'no challenge' }, 400);

  const credentialId = response.id;
  const cred = await c.env.DB.prepare(
    `SELECT credential_id, user_id, public_key, counter, transports
     FROM passkey_credentials WHERE credential_id = ?`,
  ).bind(credentialId).first<{
    credential_id: string; user_id: string;
    public_key: ArrayBuffer; counter: number; transports: string | null;
  }>();
  if (!cred) return c.json({ error: 'credential not found' }, 404);

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: c.env.RP_ORIGIN,
    expectedRPID: c.env.RP_ID,
    authenticator: {
      credentialID: cred.credential_id,
      credentialPublicKey: new Uint8Array(cred.public_key),
      counter: cred.counter,
      transports: (cred.transports ?? '').split(',').filter(Boolean) as AuthenticatorTransportFuture[],
    },
  });
  if (!verification.verified) return c.json({ error: 'verification failed' }, 401);

  await c.env.DB.prepare(
    `UPDATE passkey_credentials SET counter = ?, last_used_at = ? WHERE credential_id = ?`,
  ).bind(verification.authenticationInfo.newCounter, Date.now(), credentialId).run();
  await c.env.DB.prepare(`UPDATE users SET last_seen_at = ? WHERE id = ?`)
    .bind(Date.now(), cred.user_id).run();

  await c.env.SESSIONS.delete(`pk-auth-chal:${challengeId}`);
  const session = await createSession(c.env, cred.user_id);
  return c.json({ ok: true, session });
});

// Hono types only — re-exported for the route definitions
type AuthenticatorTransportFuture = 'usb' | 'nfc' | 'ble' | 'internal' | 'cable' | 'hybrid' | 'smart-card';
