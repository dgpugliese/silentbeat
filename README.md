# SilentBeat

An honest dead man's switch. Encrypted in your browser. Released only if you stop checking in.

**Live:** https://silentbeat.app

## What it is

You write an encrypted message, name a recipient, and set a timer. As long as you check in before the timer runs out, nothing happens. If you stop, the message is delivered. Source-protection, estate notes, "if you're reading this" letters.

## What "honest" means

A dead man's switch cannot be true zero-knowledge — *something* has to be released when you're not around to release it. Most products in this space dress that up. SilentBeat is upfront about it.

The payload AES key is split into two halves:

- **Our half** lives on our server. We have it.
- **Recipient's half** is generated in your recipient's browser at enrollment, AES-wrapped under a key derived from their WebAuthn passkey via the PRF extension, and stored on our server in that wrapped form. We never see the unwrapped half.

Neither half decrypts on its own. At expiry, the recipient taps their passkey to unwrap their half locally, combine with our half, and decrypt the message. SilentBeat cannot combine them. That's the actual claim, end-to-end verified.

The full enumeration of who we defend against and what we don't lives at [`/threat-model.html`](web/threat-model.html).

## Architecture

| Piece | Where | Why |
|---|---|---|
| API + DOs + static assets | Cloudflare Workers | one runtime, one deploy |
| Relational state (users, switches, recipients, audit log, magic tokens, passkey credentials) | D1 | SQLite-on-the-edge |
| Per-switch timer | Durable Object with `setAlarm()` | strongly consistent timer state |
| Backup expiry sweep | Cron Trigger every 5 min | catches missed alarms |
| Encrypted payload blobs | R2 | up to 50 MB per switch |
| Sessions, passkey challenges, release tokens | KV | TTL-based ephemeral state |
| Argon2id PIN hashing | `argon2-wasm-edge` (static-imported WASM) | Workers reject runtime `WebAssembly.compile` |
| Recipient passkey + PRF | WebAuthn + extensions.prf | Deterministic 32-byte secret unlocks recipient's wrapped privkey at decrypt |
| AEAD master-key wrapping | Workers Secret + AES-256-GCM | recipient email + duress slot |
| Audit log signing | Ed25519 (WebCrypto) | every entry signed; root checkpoint published |
| Email | Resend | sign-in, recipient invites, release notifications |

## Layout

```
silentbeat/
├── web/              # static frontend (served by Workers Assets)
│   ├── app.js        # shared client: session, API wrapper, AES-GCM, ECIES,
│   │                 # split-key, WebAuthn passkey + PRF helpers
│   ├── manifest.webmanifest
│   └── *.html        # index, signin, signup, dashboard, create, checkin,
│                     # finalize, log, settings, pricing, threat-model,
│                     # enroll, enroll-account, recipient, decrypt
├── worker/src/       # Cloudflare Worker (Hono router, Durable Object, cron)
│   ├── routes/       # auth, account, account_recipients, recipient_enroll,
│   │                 # switches, checkins, recipients, log, release, middleware
│   ├── lib/          # crypto, auditlog, plans, ratelimit, session, email, ulid
│   ├── do/           # SwitchTimer Durable Object
│   ├── cron.ts       # 5-min sweeper for missed alarms
│   └── index.ts
├── migrations/       # D1 schema (0001..0009)
├── design/           # original Claude Design wireframe bundle (reference)
├── wrangler.toml
└── package.json
```

## Status

| Phase | What | Status |
|---|---|---|
| 1 | Static frontend (8 wireframe screens) | ✅ |
| 2 | Worker scaffold (Hono, DO, cron, schema) | ✅ |
| 3 | Real auth (magic-link), AEAD, Ed25519 audit log, enrollment-token gate | ✅ |
| 4 | Argon2id PIN hashing, email helper, real DO release flow, PIN rate-limit | ✅ |
| 5 | Frontend wired to live API (real countdowns, real submit, real check-in) | ✅ |
| 6 | True split-key crypto (server cannot decrypt) | ✅ |
| 7 | WebAuthn passkey sign-in, HKDF on ECIES, single-use tokens, schema cleanup | ✅ |
| 8 | Argon2id over WASM (`argon2-wasm-edge`) for predictable Worker CPU | ✅ |
| 9 | Mobile / PWA pass + manifest | ✅ |
| — | Resend wired, ENVIRONMENT=production, silentbeat.app live | ✅ |
| 10 | Recipients as per-account entities; passkey + PRF replaces rescue file | ✅ |
| 11a | Premium tier scaffolding: schema, plan enforcement, /pricing, settings UI | ✅ |
| 11b | Lemon Squeezy checkout + webhook, customer portal | next |

## Local dev

```bash
npm install
npm run db:migrate:local
npm run dev
# http://localhost:8787
```

The original Claude Design wireframe bundle is preserved under `design/project/`:

```bash
cd design/project && python3 -m http.server 8080
# http://localhost:8080/SilentBeat%20Wireframes.html
```

## Deploying

Workers Secrets (set with `wrangler secret put NAME`):

- `MASTER_KEY` — 32-byte AES-GCM master KEK (base64)
- `LOG_SIGNING_KEY` — Ed25519 PKCS8 (base64)
- `LOG_PUBLIC_KEY` — Ed25519 SPKI (base64), published with each `/api/log/root`
- `RESEND_API_KEY` — outbound email
- `LEMONSQUEEZY_API_KEY` — billing (premium tier; Phase 11b)
- `LEMONSQUEEZY_WEBHOOK_SECRET` — billing webhook signature verification

Generate dev secrets and write to `.dev.vars` (gitignored):

```bash
node -e "
const c = require('crypto');
const ed = c.generateKeyPairSync('ed25519', {
  privateKeyEncoding:{type:'pkcs8',format:'der'},
  publicKeyEncoding:{type:'spki',format:'der'}
});
console.log('MASTER_KEY=' + c.randomBytes(32).toString('base64'));
console.log('LOG_SIGNING_KEY=' + ed.privateKey.toString('base64'));
console.log('LOG_PUBLIC_KEY=' + ed.publicKey.toString('base64'));
" > .dev.vars
```

`wrangler.toml` carries non-secret IDs (D1 database_id, KV id, account ID). They are public; without your Cloudflare API token they grant nothing. The `.dev.vars` file is gitignored.

## License

MIT — see [LICENSE](LICENSE).
