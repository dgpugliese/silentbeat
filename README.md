# SilentBeat

An honest dead man's switch. Encrypted in your browser. Released only if you stop checking in.

**Live demo:** https://silentbeat-staging.the-it-visionary.workers.dev

## What it is

You write an encrypted message, name a recipient, and set a timer. As long as you check in before the timer runs out, nothing happens. If you stop, the message is delivered. Source-protection, estate notes, "if you're reading this" letters.

## What "honest" means

A dead man's switch cannot be true zero-knowledge — *something* has to be released when you're not around to release it. Most products in this space dress that up. SilentBeat is upfront about it.

The payload AES key is split into two halves:

- **Share A** lives on our server. We have it.
- **Share B** is generated in your *recipient's* browser at enrollment. It never touches our server in plaintext — it's encrypted to their P-256 public key (ECIES) before we see it. Only their rescue file decrypts it.

Neither half decrypts on its own. SilentBeat can email Share A and the encrypted Share B to your recipient at expiry, but cannot ever combine them. That's the actual claim, end-to-end verified.

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
| Argon2id PIN hashing | `@noble/hashes` (pure JS) | Workers reject runtime `WebAssembly.compile` |
| AEAD master-key wrapping | Workers Secret + AES-256-GCM | recipient email + duress slot |
| Audit log signing | Ed25519 (WebCrypto) | every entry signed; root checkpoint published |
| Email | Resend (planned) | dev mode logs to console |

## Layout

```
silentbeat/
├── web/              # static frontend (landing, app, log, decrypt tools)
│   ├── app.js        # shared client: session, API wrapper, AES-GCM, ECIES, splitKey
│   └── *.html        # landing, signin, signup, dashboard, create, finalize,
│                     # checkin, log, enroll, recipient, threat-model
├── worker/src/       # Cloudflare Worker (Hono router, Durable Object, cron)
├── migrations/       # D1 schema (0001..0004)
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
| — | Staging deploy on workers.dev | ✅ |
| 7 | WebAuthn passkey UI, HKDF on ECIES, cleanup migrations | next |
| 8 | Resend domain verified, custom domain, production deploy | pending |

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
- `RESEND_API_KEY` — outbound email (when wired)

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
