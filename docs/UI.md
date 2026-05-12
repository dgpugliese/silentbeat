# UI conventions

Short reference for the patterns the static pages share. `npm run lint:ui`
enforces the rules in this doc — if it fails, the page is drifting from
one of these patterns.

## Page-width tiers

Every page applies `class="page"` plus exactly one optional modifier
that picks its max-width:

| Tier | Class | Max | Used by |
|---|---|---|---|
| Marketing landing | `page page-wide` | 1080px | `index`, `pricing` |
| Public info | `page` (bare) | 980px | `status`, `threat-model` |
| App (signed-in) | `page page-app` | 980px | `dashboard`, `create`, `checkin`, `finalize`, `log`, `settings` |
| Recipient (external) | `page recipient-page` | 540px | `decrypt`, `enroll`, `enroll-account`, `recipient` |
| Auth funnel | `page signin-page` | 520px | `signin`, `signup` |

Public info and app are the same width (980), but use different nav chrome.

## Nav

Two patterns, one per audience.

### Public nav (`.topbar` + `.nav-links`)

Used on `index`, `pricing`, `status`, `threat-model`.

```html
<nav class="topbar">
  <a href="/" class="brand">
    <span class="name">silentbeat</span>
    <span class="blip" aria-hidden="true"></span>
  </a>
  <div class="nav-links">
    <a href="/#how">how it works</a>
    <a href="/threat-model.html">threat model</a>
    <a href="/status.html">status</a>
    <a href="/log.html">public log</a>
    <a href="/pricing.html">pricing</a>
    <a class="btn btn-sm" href="/signin.html">sign in</a>
  </div>
</nav>
```

Rules:
- **Brand is always an `<a href="/">`** — including on the homepage itself.
- **Link order is fixed**: how it works → threat model → status → public log → pricing → sign in.
- **Sign-in is a button** (`class="btn btn-sm"`), not a plain link. It is the call-to-action.
- On the current page, add `class="active-link"` to that page's link.

### App nav (`.appnav` + `.appnav-links`)

Used on `dashboard`, `create`, `checkin`, `finalize`, `log`, `settings`.

```html
<nav class="appnav">
  <a href="/" class="brand">
    <span class="name">silentbeat</span>
    <span class="blip" aria-hidden="true"></span>
  </a>
  <div class="appnav-links">
    <a href="/dashboard.html" class="active">dashboard</a>
    <a href="/log.html">log</a>
    <a href="/settings.html">settings</a>
  </div>
</nav>
```

Rules:
- **Link order is fixed**: dashboard → log → settings.
- The current page's link gets `class="active"`.

### No nav

The recipient flow (`decrypt`, `enroll`, `enroll-account`, `recipient`)
and the auth funnel (`signin`, `signup`) ship without a nav. The user is
either mid-action or external. Don't add chrome.

## Page titles

Every page's `<h1>` uses a `.page-title-*` class — never inline
`style="font-size: …"`. The classes are responsive (`clamp()`):

| Class | Range | Use |
|---|---|---|
| `.page-title` | 26→32px | log, settings, decrypt, enroll, enroll-account, recipient |
| `.page-title-md` | 28→36px | checkin, create, finalize |
| `.page-title-lg` | 32→44px | signin, signup |
| `.page-title-xl` | 36→56px | pricing, status, threat-model |

## Linting

```bash
npm run lint:ui
```

The script (`scripts/check-ui-consistency.sh`) checks:

- Public nav has all six required links, in order.
- The brand element is always an `<a href="/">`.
- Sign-in carries `class="btn btn-sm"`.
- App nav has dashboard/log/settings.
- Each page applies the page-width class for its tier.
- No `<h1>` has an inline `font-size` — use `.page-title-*`.

If you add a new page, add it to the appropriate list at the top of the
lint script.
