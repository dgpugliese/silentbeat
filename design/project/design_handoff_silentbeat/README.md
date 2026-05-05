# Handoff: SilentBeat

## Overview

SilentBeat is a dead man's switch service. Users encrypt a payload (text/file), name a recipient, set a timer, and create two PINs (defuse + duress). If they don't check in before the timer expires, the payload is released to the recipient. The brand premise is **honesty about what the service can and cannot do** — the UI surfaces trust boundaries explicitly rather than hiding behind generic "secure" language.

## About the Design Files

The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, not production code to copy directly. The task is to **recreate these designs in your target codebase's environment** (React, SwiftUI, etc.), using its established patterns and component libraries. If no environment exists yet, pick a framework appropriate to the project (React + Vite + Tailwind is a reasonable default) and build there.

The HTML uses inline JSX via Babel-standalone purely for prototyping speed. None of the loader plumbing, `Object.assign(window, ...)` exports, or `<script type="text/babel">` setup should carry over.

## Fidelity

**Low-fidelity wireframes.** These mocks intentionally use a sketchy, hand-drawn aesthetic to communicate that layout, hierarchy, and copy are decided but visual styling is not final. The handwriting fonts (Caveat, Kalam) are wireframe scaffolding — replace them with your codebase's production type stack. Use these as a guide for **layout, hierarchy, copy, and interaction model**, not for final visual styling. Apply your design system / token set for the production build.

The **brand assets** (logo, favicon, color palette in `SilentBeat Brand.html`) are intended to be hi-fi and should ship as-is.

## Screens / Views

There are six screens, each with three layout directions (A / B / C). Pick the direction noted as **recommended** below as the starting point unless the team decides otherwise.

### 1. Landing page
**Purpose:** First-time visitor reads the trust statement, decides whether SilentBeat is for them, signs up.

- **A** — Centered hero + 3-column trust statement ("What the server can do / can't do / what you trust us with"). **Recommended.**
- **B** — README-style single column, numbered five-step explanation, "This is not zero-knowledge" callout.
- **C** — Architecture diagram on the right showing browser → server → recipient key-share flow.

Content (whichever direction you pick): hero headline, sub-headline emphasizing the dead-man's-switch premise, three-part trust statement, primary CTA `Create a switch`, secondary CTA `Read trust model`, link to public log.

### 2. Switch creation
**Purpose:** Compose payload, name recipient, set timer, set defuse + duress PINs, arm the switch.

- **A** — Multi-step stepper wizard (5 steps: payload → recipient → timer → pins → review).
- **B** — Single-page form with a sticky review sidebar that shows completion state. **Recommended.**
- **C** — Terminal-prompted compose for power users (consider as an "advanced" toggle, not the default).

Required fields: payload (text + optional file ≤ 25 MB), recipient email, timer (presets 12h, 24h, 3d, 7d, 14d, 30d, custom; min 1h, max 1y), defuse PIN (6 digits), duress PIN (6 digits, same length to be visually indistinguishable on entry).

### 3. Dashboard
**Purpose:** See switch state at a glance and check in.

- **A** — Single switch with a giant countdown front-and-center, recent heartbeat list, danger zone.
- **B** — Multi-switch list with per-row countdown, urgency color coding (green > 24h, red < 24h, gray = disarmed). **Recommended** for product launch (most users will eventually want >1 switch).
- **C** — Heartbeat trace visualization (last 14 days as an EKG-style line) + countdown.

Always show: countdown, heartbeat status (alive/silent), check-in CTA. Heartbeat indicator is a green dot that pulses (1.6s ease-in-out, scale 1 → 1.4 + opacity 0.85 → 0.4).

### 4. Check-in / PIN entry
**Purpose:** User types their PIN to either reset the timer (defuse) or trigger immediate release (duress).

- **A** — On-screen numeric keypad with 6 dot indicators above. **Recommended for mobile.**
- **B** — Per-digit boxes (like 2FA codes), with explanatory "what happens after this check-in" panel. **Recommended for desktop.**
- **C** — Keypad with explicit two-paths sidebar explaining defuse vs duress.

**Critical:** the same input accepts both PINs. The UI must not visually distinguish which PIN is being entered. After 5 wrong PINs in 1h, lock check-in for support recovery — wrong PINs do **not** trigger release.

### 5. Public transparency log
**Purpose:** Anyone (signed in or not) can see all create / defuse / release / duress events. Append-only, Merkle-rooted.

- **A** — Dense terminal-style monospace dump. **Recommended** (matches user choice from intake).
- **B** — Filterable table with stat strip header.
- **C** — Live event feed with relative timestamps.

Each event shows: timestamp (UTC), event type, switch hash (first 6 chars), actor (cron / user), sequence number. Display the current Merkle root, signed by `silentbeat-prod`. Provide CSV export.

### 6. Recipient release
**Purpose:** Jane (the recipient) gets an email and lands on a decrypt page.

- **A** — Bare-bones decrypt page (link from email + PIN field).
- **B** — Explanatory landing with full context ("Sam asked us to send this if they went silent…"). **Recommended** — recipients often won't remember they were named.
- **C** — Two-step: verify identity via emailed code, then decrypt.

The decrypt step combines two key shares (one in the email body, one in the URL fragment) entirely client-side. The server never sees the combined key. The link must work once per device.

## Interactions & Behavior

- **Heartbeat blip animation:** `@keyframes blip { 0%,100% { transform: scale(1); opacity: .85 } 50% { transform: scale(1.4); opacity: .4 } }`, 1.6s ease-in-out infinite. Apply to the green dot in the nav and on dashboard cards.
- **Countdown:** updates every second, format `DDd HHh MMm SSs`. Color shifts to accent-red when remaining time < 24 hours.
- **Check-in:** typing the defuse PIN resets the timer immediately + writes a `defuse#…` event to the public log. Typing the duress PIN triggers release immediately, purges the encrypted blob from storage, writes `duress#…` to the log.
- **Tweaks panel** in the prototype is a dev-tool; do not ship it.

## State Management

- `switch.state ∈ {draft, armed, alive, urgent, released, duressed, disarmed}`
- `switch.expiresAt` (ISO timestamp), `switch.lastCheckinAt`, `switch.timerDuration`
- `user.passkeys[]`, `user.recoveryContact`
- Public log is append-only; clients should treat as read-only and refresh every 60s.

## Design Tokens

Replace the wireframe values with your design system, but as a starting reference:

| Token | Value (dark) | Use |
|---|---|---|
| `--paper` | `#1c1d20` | Page background |
| `--paper-shade` | `#26272b` | Card/elevated surfaces |
| `--ink` | `#ece8dc` | Foreground text |
| `--ink-soft` | `#b8b6af` | Secondary text |
| `--ink-faint` | `#777572` | Tertiary / metadata |
| `--accent` | `oklch(0.72 0.18 25)` | Danger / duress / urgent |
| `--accent-2` | `oklch(0.78 0.18 150)` | Alive / healthy / defuse-success |
| `--accent-3` | `oklch(0.74 0.16 250)` | Info / neutral highlight |

**Type stack (production — replace wireframe handwriting):**
- Display / heading: a confident sans (e.g., Söhne, Inter, IBM Plex Sans).
- Body: same family, regular.
- Mono: JetBrains Mono or similar, used for timestamps, hashes, timer digits, event log rows.

**Spacing scale:** 4 / 8 / 12 / 18 / 24 / 32 / 48.

**Border radius:** 8 (controls), 12 (cards). Drop the wobble/asymmetric radii from the wireframe.

## Assets

Brand assets in `brand/`:

- `brand/logo.svg` — primary wordmark on dark backgrounds, includes heartbeat trace + glowing alive-dot.
- `brand/logo-light.svg` — same, for light backgrounds.
- `brand/mark.svg` — trace-only mark (no wordmark).
- `brand/favicon.svg` — 64×64 rounded dark square with trace + dot, reads at 16px.

The logo's green pulse dot has an SVG `feGaussianBlur` glow filter — preserve it. The wordmark is set in Caveat 700 in the SVG; if you want a different wordmark font for production, edit the `<text>` element's `font-family`.

## Files

In this handoff folder:

- `SilentBeat Wireframes.html` — open in a browser to see all 18 wireframes on a pan/zoom canvas. Click any artboard to focus.
- `SilentBeat Brand.html` — brand sheet (logo lockups, color, type, favicon variants).
- `styles.css` — wireframe styles. Useful for token reference; do not ship.
- `primitives.jsx` — shared sketchy components (Box, NavBar, CountdownDigits, etc.). Reference only.
- `screens-*.jsx` — one file per screen (landing, create, dashboard, checkin, log-recipient). Each exports three direction variants.
- `design-canvas.jsx`, `tweaks-panel.jsx` — prototype host components. Do not ship.
- `screenshots/` — PNG of each of the 18 wireframes (1080×720 each), named by screen and direction.
- `brand/` — production logo assets.
