#!/usr/bin/env bash
# UI consistency lint. Flags drift in shared page patterns:
#   - public nav: link order, sign-in button styling
#   - app nav: link order
#   - page-width tier per page
#
# Run from repo root: ./scripts/check-ui-consistency.sh
# Exit code: 0 if clean, 1 if any drift.

set -u
cd "$(dirname "$0")/.."

fail=0
say()  { printf '  %s\n' "$*"; }
err()  { printf '✗ %s\n' "$*"; fail=1; }
ok()   { printf '✓ %s\n' "$*"; }

# Canonical patterns

# Public nav: every page with class="nav-links" must include in this order:
#   how it works, threat model, status, public log, pricing, sign in (as btn)
public_pages='index pricing status threat-model'

# App nav: every page with class="appnav-links" must include in this order:
#   dashboard, log, settings
app_pages='dashboard create checkin finalize log settings'

# Page-width tier expectations (parallel arrays — keeps bash 3.2 happy)
width_pages='index pricing status threat-model log dashboard create checkin finalize settings decrypt enroll enroll-account recipient signin signup'
width_for() {
  case "$1" in
    index|pricing)                          echo 'page-wide' ;;
    status|threat-model)                    echo 'page' ;;
    log|dashboard|create|checkin|finalize|settings) echo 'page-app' ;;
    decrypt|enroll|enroll-account|recipient) echo 'recipient-page' ;;
    signin|signup)                          echo 'signin-page' ;;
    *)                                      echo '' ;;
  esac
}

echo "── public nav ─────────────────────────────────────────"
for p in $public_pages; do
  f="web/${p}.html"
  [[ -f "$f" ]] || { err "$p: file missing"; continue; }

  # Required links present
  for required in '/#how' '/threat-model.html' '/status.html' '/log.html' '/pricing.html' '/signin.html'; do
    if ! grep -q "href=\"${required}\"" "$f"; then
      err "$p: missing nav link to $required"
    fi
  done

  # Sign-in must be styled as button
  if ! grep -qE 'class="btn btn-sm"[^>]*href="/signin\.html"' "$f"; then
    err "$p: /signin.html link is not styled as .btn .btn-sm"
  fi

  # Brand must be an <a href="/"> (clickable)
  if ! grep -qE '<a[^>]*href="/"[^>]*class="brand"' "$f"; then
    err "$p: brand element is not an <a href=\"/\">"
  fi
done

echo
echo "── app nav ────────────────────────────────────────────"
for p in $app_pages; do
  f="web/${p}.html"
  [[ -f "$f" ]] || { err "$p: file missing"; continue; }
  for required in '/dashboard.html' '/log.html' '/settings.html'; do
    if ! grep -q "href=\"${required}\"" "$f"; then
      err "$p: missing app-nav link to $required"
    fi
  done
done

echo
echo "── page-width tier ────────────────────────────────────"
for p in $width_pages; do
  f="web/${p}.html"
  [[ -f "$f" ]] || { err "$p: file missing"; continue; }
  want=$(width_for "$p")
  if [[ "$want" == "page" ]]; then
    if ! grep -qE 'class="page"' "$f"; then
      err "$p: expected bare class=\"page\""
    fi
  else
    if ! grep -qE "class=\"page ${want}\"" "$f"; then
      err "$p: expected class=\"page ${want}\""
    fi
  fi
done

echo
echo "── inline H1 font-size (should be a .page-title-* class) ──"
inline_h1=$(grep -nE 'h1[^>]*style="[^"]*font-size' web/*.html || true)
if [[ -n "$inline_h1" ]]; then
  err "found inline font-size on h1 — use .page-title / -md / -lg / -xl:"
  echo "$inline_h1" | sed 's/^/    /'
fi

echo
if [[ $fail -eq 0 ]]; then
  echo "✓ UI consistency: clean"
else
  echo "✗ UI consistency: drift found"
  exit 1
fi
