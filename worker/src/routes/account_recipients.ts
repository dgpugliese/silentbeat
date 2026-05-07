// Per-account recipient management. A recipient enrolled here can be the target
// of N switches without re-enrolling. Replaces the per-switch recipient enrollment
// model from earlier phases.
//
// Phase 10a scope: schema-level CRUD. Real enrollment + WebAuthn-PRF flow lands
// in Phase 10b. Switch creation against these recipients lands in Phase 10d.

import { Hono } from 'hono';
import type { Env } from '../index';
import { ulid } from '../lib/ulid';
import { sha256Hex, randomBytes, bytesToB64, aeadEncrypt, aeadDecrypt } from '../lib/crypto';
import { sendEmail } from '../lib/email';
import { requireUser } from './middleware';

export const accountRecipients = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
accountRecipients.use('*', requireUser);

const enc = new TextEncoder();
const dec = new TextDecoder();

interface RecipientRow {
  id: string;
  display_name: string | null;
  email_ct: ArrayBuffer;
  status: string;
  created_at: number;
  enrolled_at: number | null;
  invite_token_expires_at: number | null;
  invite_consumed_at: number | null;
}

async function decryptEmail(env: Env, row: RecipientRow): Promise<string> {
  const ptBytes = await aeadDecrypt(env, new Uint8Array(row.email_ct), enc.encode(row.id));
  return dec.decode(ptBytes);
}

accountRecipients.get('/', async (c) => {
  const userId = c.get('userId');
  const { results } = await c.env.DB.prepare(
    `SELECT id, display_name, email_ct, status, created_at, enrolled_at,
            invite_token_expires_at, invite_consumed_at
     FROM account_recipients WHERE owner_user_id = ? ORDER BY created_at DESC`,
  ).bind(userId).all<RecipientRow>();

  const out = await Promise.all((results ?? []).map(async (r) => ({
    id: r.id,
    display_name: r.display_name,
    email: await decryptEmail(c.env, r),
    status: r.status,
    created_at: r.created_at,
    enrolled_at: r.enrolled_at,
    invite_expires_at: r.invite_token_expires_at,
  })));

  return c.json({ recipients: out });
});

accountRecipients.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ email?: string; displayName?: string }>().catch(() => ({} as { email?: string; displayName?: string }));
  const email = (body.email ?? '').trim();
  const displayName = (body.displayName ?? '').trim() || null;
  if (!email.includes('@')) return c.json({ error: 'invalid email' }, 400);

  const id = ulid();
  const now = Date.now();
  const inviteToken = bytesToB64(randomBytes(32)).replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
  const inviteTokenHash = await sha256Hex(inviteToken);
  const expires = now + 14 * 24 * 60 * 60 * 1000; // 14 day TTL

  const emailBlob = await aeadEncrypt(c.env, enc.encode(email), enc.encode(id));

  await c.env.DB.prepare(
    `INSERT INTO account_recipients
     (id, owner_user_id, display_name, email_ct, invite_token_hash, invite_token_expires_at, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'invited', ?)`,
  ).bind(id, userId, displayName, emailBlob, inviteTokenHash, expires, now).run();

  // Owner's email lives on the user row; we look it up for the invite from-context line.
  const owner = await c.env.DB.prepare(`SELECT email FROM users WHERE id = ?`)
    .bind(userId).first<{ email: string }>();

  const enrollUrl = `${c.env.PUBLIC_BASE_URL}/enroll-account.html?id=${id}&t=${inviteToken}`;
  await sendEmail(c.env, {
    to: email,
    subject: `${owner?.email ?? 'Someone'} would like you to be their SilentBeat contact`,
    text: [
      `${owner?.email ?? 'A SilentBeat user'} has set up SilentBeat — a digital safety net that delivers a message to a trusted contact if they go silent.`,
      '',
      `They've added you as that contact. To accept, click the link below from the device you'd want to use to read the message someday.`,
      '',
      enrollUrl,
      '',
      `Setup takes about thirty seconds. Your phone or laptop will ask you to set up a passkey — that's the key SilentBeat uses to deliver the message safely. No file to save, no password to remember.`,
      '',
      `If this seems wrong or unexpected, just ignore this email. Nothing happens until you accept.`,
      '',
      `Link expires in 14 days.`,
    ].join('\n'),
    html: `
      <p>${owner?.email ?? 'A SilentBeat user'} has set up SilentBeat — a digital safety net that delivers a message to a trusted contact if they go silent.</p>
      <p>They've added you as that contact. To accept, click the link below from the device you'd want to use to read the message someday.</p>
      <p><a href="${enrollUrl}">${enrollUrl}</a></p>
      <p>Setup takes about thirty seconds. Your phone or laptop will ask you to set up a passkey — that's the key SilentBeat uses to deliver the message safely. No file to save, no password to remember.</p>
      <p>If this seems wrong or unexpected, just ignore this email. Nothing happens until you accept.</p>
      <p style="color:#888">Link expires in 14 days.</p>
    `,
  });

  const dev_link = c.env.ENVIRONMENT !== 'production' ? enrollUrl : undefined;
  return c.json({ ok: true, id, dev_link });
});

accountRecipients.get('/:id/pubkey', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT id, status, pubkey_jwk_json FROM account_recipients
     WHERE id = ? AND owner_user_id = ?`,
  ).bind(id, userId).first<{ id: string; status: string; pubkey_jwk_json: string | null }>();
  if (!row) return c.json({ error: 'not_found' }, 404);
  if (row.status !== 'enrolled' || !row.pubkey_jwk_json) {
    return c.json({ error: `not_enrolled` }, 409);
  }
  return c.json({ id: row.id, pubkeyJwk: JSON.parse(row.pubkey_jwk_json) });
});

accountRecipients.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  // Block deletion if any switches reference this recipient (matches user's
  // chosen "option B" revocation policy: explicit, no orphaned switches).
  const ref = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM switches
     WHERE account_recipient_id = ? AND status IN ('pending','armed')`,
  ).bind(id).first<{ n: number }>();
  if ((ref?.n ?? 0) > 0) {
    return c.json({
      error: 'recipient_has_active_switches',
      count: ref?.n,
      detail: 'Destroy or re-target the switches first before removing this recipient.',
    }, 409);
  }

  const r = await c.env.DB.prepare(
    `DELETE FROM account_recipients WHERE id = ? AND owner_user_id = ?`,
  ).bind(id, userId).run();
  if (!r.meta.changes) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});

accountRecipients.post('/:id/reinvite', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  const row = await c.env.DB.prepare(
    `SELECT id, email_ct, status FROM account_recipients
     WHERE id = ? AND owner_user_id = ?`,
  ).bind(id, userId).first<{ id: string; email_ct: ArrayBuffer; status: string }>();
  if (!row) return c.json({ error: 'not_found' }, 404);
  if (row.status !== 'invited') return c.json({ error: `status_${row.status}` }, 409);

  const inviteToken = bytesToB64(randomBytes(32)).replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
  const inviteTokenHash = await sha256Hex(inviteToken);
  const expires = Date.now() + 14 * 24 * 60 * 60 * 1000;

  await c.env.DB.prepare(
    `UPDATE account_recipients SET invite_token_hash = ?, invite_token_expires_at = ?
     WHERE id = ?`,
  ).bind(inviteTokenHash, expires, id).run();

  const email = dec.decode(await aeadDecrypt(c.env, new Uint8Array(row.email_ct), enc.encode(row.id)));
  const enrollUrl = `${c.env.PUBLIC_BASE_URL}/enroll-account.html?id=${id}&t=${inviteToken}`;
  await sendEmail(c.env, {
    to: email,
    subject: 'Your SilentBeat enrollment link (re-issued)',
    text: `Here is a fresh enrollment link, valid 14 days:\n\n${enrollUrl}`,
    html: `<p>Here is a fresh enrollment link, valid 14 days:</p><p><a href="${enrollUrl}">${enrollUrl}</a></p>`,
  });

  const dev_link = c.env.ENVIRONMENT !== 'production' ? enrollUrl : undefined;
  return c.json({ ok: true, dev_link });
});
