# SilentBeat

> **An honest dead man's switch.** Encrypted in your browser. Released only if you stop checking in.

🔗 **Live:** [silentbeat.app](https://silentbeat.app) &nbsp;·&nbsp; 🛡 [threat model](web/threat-model.html) &nbsp;·&nbsp; 📜 [audit log](https://silentbeat.app/log)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Deployed on Cloudflare](https://img.shields.io/badge/edge-Cloudflare%20Workers-f38020)](https://workers.cloudflare.com/)
[![Built with Claude Code](https://img.shields.io/badge/built%20with-Claude%20Code-d97757)](https://claude.com/claude-code)

You write an encrypted message, name a recipient, and set a timer. As long as you check in before the timer runs out, nothing happens. If you stop, the message is delivered. Source-protection, estate notes, "if you're reading this" letters.

> ⚠ **"Honest" is a feature, not a marketing line.** A dead man's switch cannot be true zero-knowledge — *something* has to be released when you're not around to release it. Most products in this space dress that up. SilentBeat is upfront about it. The full enumeration of what we defend against and what we don't lives in the [threat model](web/threat-model.html).

---

## How it works

```
sender browser            cloudflare worker            recipient browser
──────────────            ─────────────────            ─────────────────
write message    ───►   ciphertext stored in R2  ───►   passkey unwraps half-B
AES-256-GCM             half-A held server-side          half-A fetched on release
half-B wrapped under     ↓ DO setAlarm() / cron          combine → decrypt locally
recipient's passkey       countdown timer
                         ↓ (no check-in by deadline)
                        release token → email recipient
```

The payload AES key is split in two:

- **Our half (A)** lives on our server. We have it.
- **Recipient's half (B)** is generated in the recipient's browser at enrollment, AES-wrapped under a key derived from their **WebAuthn passkey via the PRF extension**, and stored on our server in that wrapped form. We never see the unwrapped half.

Neither half decrypts on its own. At expiry, the recipient taps their passkey to unwrap their half locally, combines with our half, and decrypts the message. SilentBeat cannot combine them. That's the actual claim, end-to-end verified.

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
| Recipient passkey + PRF | WebAuthn + `extensions.prf` | deterministic 32-byte secret unwraps recipient's half-B at decrypt |
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
| — | Resend wired, `ENVIRONMENT=production`, silentbeat.app live | ✅ |
| 10 | Recipients as per-account entities; passkey + PRF replaces rescue file | ✅ |
| 11a | Premium tier scaffolding: schema, plan enforcement, /pricing, settings UI | ✅ |
| 11b | Lemon Squeezy checkout + webhook, customer portal | next |

## Quick start

```bash
npm install
npm run db:migrate:local
npm run dev          # http://localhost:8787
```

The original Claude Design wireframe bundle is preserved under `design/project/`:

```bash
cd design/project && python3 -m http.server 8080
# http://localhost:8080/SilentBeat%20Wireframes.html
```

### Deploy

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

[`wrangler.toml`](wrangler.toml) carries non-secret IDs (D1 `database_id`, KV id, account ID). They are public; without your Cloudflare API token they grant nothing. The `.dev.vars` file is gitignored.

## License

MIT — see [LICENSE](LICENSE).

---

<sub>Built end-to-end with [Claude Code](https://claude.com/claude-code) — design via Claude Design, frontend + Cloudflare Worker written collaboratively, infrastructure provisioned through the Cloudflare MCP. AI as a serious engineering partner, not a code-completion toy.</sub>
