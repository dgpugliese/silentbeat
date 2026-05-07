// Anonymous recipient self-enrollment for account_recipients. The recipient is
// not a SilentBeat user, so these routes are unauthenticated; access is gated
// by a one-time invite token (sha256-hashed at rest, 14d TTL, cleared on enroll).
//
// The crypto: at enrollment, recipient registers a WebAuthn passkey with the
// PRF extension, which deterministically produces a 32-byte secret given a
// per-recipient salt. The browser uses that secret to AES-GCM-wrap an ECDH
// P-256 private key and uploads the WRAPPED privkey + the (public) pubkey.
// At decrypt time the same passkey + salt regenerates the wrapping key.
//
// Server-side, this means we hold:
//   - WebAuthn credential (id, public key, counter, transports)
//   - prf_salt (32 random bytes) — public; useless without the authenticator
//   - enc_privkey_jwk_ct + iv — useless without PRF output
//   - pubkey_jwk_json — public, used to ECIES-encrypt shareB at switch creation
// Server cannot decrypt; passkey + PRF stays on the recipient's device.

import { Hono } from 'hono';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { Env } from '../index';
import { sha256Hex, randomBytes, bytesToB64, constantTimeEqual } from '../lib/crypto';

export const recipientEnroll = new Hono<{ Bindings: Env }>();

const enc = new TextEncoder();
const CHAL_TTL = 600;

type AuthenticatorTransportFuture = 'usb' | 'nfc' | 'ble' | 'internal' | 'cable' | 'hybrid' | 'smart-card';

recipientEnroll.post('/:id/enroll/begin', async (c) => {
  const id = c.req.param('id');
  const { token } = await c.req.json<{ token: string }>().catch(() => ({} as { token?: string }));
  if (!token) return c.json({ error: 'token required' }, 400);

  const row = await c.env.DB.prepare(
    `SELECT id, status, invite_token_hash, invite_token_expires_at, prf_salt
     FROM account_recipients WHERE id = ?`,
  ).bind(id).first<{
    id: string; status: string;
    invite_token_hash: string | null; invite_token_expires_at: number | null;
    prf_salt: ArrayBuffer | null;
  }>();
  if (!row) return c.json({ error: 'not_found' }, 404);
  if (row.status !== 'invited') return c.json({ error: `status_${row.status}` }, 409);

  const tokenHash = await sha256Hex(token);
  if (!row.invite_token_hash || !constantTimeEqual(tokenHash, row.invite_token_hash)) {
    return c.json({ error: 'invalid_token' }, 401);
  }
  if (!row.invite_token_expires_at || row.invite_token_expires_at < Date.now()) {
    return c.json({ error: 'token_expired' }, 401);
  }

  // Generate the PRF salt once per recipient and persist it. Must remain stable
  // across enrollment + every future decrypt; salt is public, no secrecy needed.
  let prfSaltBytes: Uint8Array;
  if (row.prf_salt) {
    prfSaltBytes = new Uint8Array(row.prf_salt);
  } else {
    prfSaltBytes = randomBytes(32);
    await c.env.DB.prepare(
      `UPDATE account_recipients SET prf_salt = ? WHERE id = ?`,
    ).bind(prfSaltBytes, id).run();
  }

  const options = await generateRegistrationOptions({
    rpName: c.env.RP_NAME,
    rpID: c.env.RP_ID,
    userName: 'recipient-' + id.slice(-8),
    userID: enc.encode(id),
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });

  // Cache challenge keyed by recipient id (anonymous; no session cookie).
  await c.env.SESSIONS.put(`recip-reg-chal:${id}`, options.challenge, { expirationTtl: CHAL_TTL });

  return c.json({
    options,
    prf_salt_b64: bytesToB64(prfSaltBytes),
  });
});

recipientEnroll.post('/:id/enroll/finish', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    token: string;
    response: any;
    pubkeyJwk: any;
    encPrivkeyCtB64: string;
    encPrivkeyIvB64: string;
  }>().catch(() => ({} as any));

  const { token, response, pubkeyJwk, encPrivkeyCtB64, encPrivkeyIvB64 } = body;
  if (!token || !response || !pubkeyJwk || !encPrivkeyCtB64 || !encPrivkeyIvB64) {
    return c.json({ error: 'missing fields' }, 400);
  }

  const row = await c.env.DB.prepare(
    `SELECT id, status, invite_token_hash, invite_token_expires_at
     FROM account_recipients WHERE id = ?`,
  ).bind(id).first<{
    id: string; status: string;
    invite_token_hash: string | null; invite_token_expires_at: number | null;
  }>();
  if (!row) return c.json({ error: 'not_found' }, 404);
  if (row.status !== 'invited') return c.json({ error: `status_${row.status}` }, 409);

  const tokenHash = await sha256Hex(token);
  if (!row.invite_token_hash || !constantTimeEqual(tokenHash, row.invite_token_hash)) {
    return c.json({ error: 'invalid_token' }, 401);
  }
  if (!row.invite_token_expires_at || row.invite_token_expires_at < Date.now()) {
    return c.json({ error: 'token_expired' }, 401);
  }

  const challenge = await c.env.SESSIONS.get(`recip-reg-chal:${id}`);
  if (!challenge) return c.json({ error: 'no_challenge' }, 400);

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: c.env.RP_ORIGIN,
    expectedRPID: c.env.RP_ID,
  });
  if (!verification.verified || !verification.registrationInfo) {
    return c.json({ error: 'verification_failed' }, 400);
  }

  const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;
  const transports = (response?.response?.transports ?? []).join(',');

  // Decode the wrapped-privkey blobs into bytes for storage.
  const encPrivkeyCt = Uint8Array.from(atob(encPrivkeyCtB64), (ch) => ch.charCodeAt(0));
  const encPrivkeyIv = Uint8Array.from(atob(encPrivkeyIvB64), (ch) => ch.charCodeAt(0));

  await c.env.DB.prepare(
    `UPDATE account_recipients
     SET passkey_credential_id = ?, passkey_public_key = ?, passkey_counter = ?, passkey_transports = ?,
         enc_privkey_jwk_ct = ?, enc_privkey_iv = ?, pubkey_jwk_json = ?,
         status = 'enrolled', enrolled_at = ?,
         invite_token_hash = NULL, invite_token_expires_at = NULL, invite_consumed_at = ?
     WHERE id = ?`,
  ).bind(
    credentialID,
    credentialPublicKey,
    counter,
    transports,
    encPrivkeyCt,
    encPrivkeyIv,
    JSON.stringify(pubkeyJwk),
    Date.now(),
    Date.now(),
    id,
  ).run();

  await c.env.SESSIONS.delete(`recip-reg-chal:${id}`);
  return c.json({ ok: true });
});
