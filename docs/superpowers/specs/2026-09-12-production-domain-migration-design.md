# Ultimate Hockey production domain migration design

**Date:** 2026-09-12  
**Status:** approved in chat; pending written-spec review  
**Primary production URL:** `https://ultimatehockey.ru`  
**Legacy production URL:** `https://hockey.inbotwetrust.ru`  
**Development URL:** `https://dev.hockey.inbotwetrust.ru` (unchanged)

## Goal

Move the public production application to `ultimatehockey.ru` without moving the VPS,
containers, production database, Redis, or object storage. Keep the existing development
environment on `dev.hockey.inbotwetrust.ru`. Preserve old production links by redirecting
`hockey.inbotwetrust.ru` to the equivalent path and query on the new domain indefinitely.

The migration must avoid a planned outage and must be reversible until the new domain has
passed production acceptance.

## Non-goals

- Renaming or moving the development environment.
- Moving infrastructure or copying production data.
- Rotating credentials, Telegram bot tokens, VAPID keys, or OAuth application IDs.
- Changing game mechanics, APIs, database schema, or application content.
- Rewriting historical specifications and implementation plans solely because they mention
  the old domain. Operational documentation and active defaults are updated; historical
  records remain historical.

## Target routing

| Host | Behavior |
| --- | --- |
| `ultimatehockey.ru` | Canonical production application and `/api/*` reverse proxy |
| `www.ultimatehockey.ru` | Permanent redirect to `https://ultimatehockey.ru{uri}` |
| `hockey.inbotwetrust.ru` | Permanent redirect to `https://ultimatehockey.ru{uri}` after acceptance |
| `dev.hockey.inbotwetrust.ru` | Existing development application, unchanged |

Redirects preserve path and query. HTTPS remains terminated by Caddy with automatic
certificates. The apex host is canonical so browser storage, PWA installation, service-worker
scope, OAuth state, and push subscriptions converge on one production origin.

## Migration strategy

The cutover uses two production releases rather than replacing the host in one step.

### Phase 0: external prerequisites

Before deploying code that references the new host:

1. Resolve the current production VPS public IPv4 and, if actually used, IPv6 addresses.
2. Create DNS records for `ultimatehockey.ru` and `www.ultimatehockey.ru` pointing to that VPS.
   Do not add an `AAAA` record unless the VPS has working inbound IPv6 on ports 80 and 443.
3. Use a short DNS TTL for the cutover window, then raise it after acceptance.
4. Verify authoritative DNS from at least two public resolvers and verify ports 80/443 reach
   the current Caddy instance.
5. Add `https://ultimatehockey.ru/auth/vk/callback` to the VK ID application's allowed redirect
   URLs while retaining the old callback through the compatibility window.
6. Set the Telegram bot domain to `ultimatehockey.ru` in BotFather immediately before production
   acceptance. This is an external manual step and requires access to the bot owner account.
7. Update the YooKassa production return URL to
   `https://ultimatehockey.ru/inventory?tab=bank&payment=return` in the production configuration,
   retaining the same shop and secret key. Provider-side allowed return/callback settings, if
   enabled in the merchant cabinet, must also allow the new origin before a real payment check.

DNS ownership, registrar access, BotFather access, VK ID console access, and YooKassa cabinet
access are explicit user-side prerequisites. No credential or account setting is changed without
the user's direct approval for that system.

### Phase 1: parallel serving

The first release makes Caddy serve the same production application on both
`ultimatehockey.ru` and `hockey.inbotwetrust.ru`; `www.ultimatehockey.ru` redirects to the apex.
The development site remains a separate Caddy block backed by `server-dev` and `web-dev`.

Production deployment configuration passes hostnames explicitly rather than relying on an
unknown value left in the VPS `.env`. Development deployment must preserve the production host
variables when it recreates the shared Caddy container. This prevents a later dev deployment
from silently reverting production routing.

The production workflow's canonical health and frontend smoke checks move to
`https://ultimatehockey.ru`. The legacy host receives an additional compatibility smoke check
while it still serves the app.

### Phase 2: acceptance and redirect

After the new origin passes acceptance, the second production release changes
`hockey.inbotwetrust.ru` from parallel serving to a permanent redirect. Use HTTP 308 so method
semantics are preserved even though normal browser traffic should only need GET/HEAD redirects.
The workflow verifies:

- the new host serves healthy API and frontend responses;
- the old host returns the expected redirect to the same path and query;
- the development host still serves the dev environment and has not been redirected.

The old DNS record and Caddy certificate remain in place indefinitely so existing bookmarks,
shared links, and stale PWA entry points continue to reach the application.

## Repository changes

Expected active files:

- `Caddyfile`: canonical production route, parallel/legacy route, `www` redirect, unchanged dev
  route.
- `docker-compose.yml`: explicit Caddy environment for canonical, legacy, and dev hosts with
  safe defaults.
- `.github/workflows/deploy.yml`: canonical production URL, hostname variables, VAPID subject
  default, canonical smoke, and legacy redirect smoke.
- `.github/workflows/deploy-dev.yml`: preserve the unchanged dev URL and provide the same
  production hostname variables when recreating shared Caddy.
- `.env.example`: document canonical, legacy, and dev hostname configuration.
- `packages/server/src/push/service.ts` and its focused tests: change the fallback VAPID contact
  subject to `mailto:push@ultimatehockey.ru`. Existing keys remain unchanged.
- Active operational documentation (`README.md`, `AGENTS.md`, and mirrored `CLAUDE.md` where
  applicable): identify the canonical production URL and legacy redirect.

The hostname check in `DailyScreen.tsx` is dev-only and continues to recognize
`dev.hockey.inbotwetrust.ru`; it must not be changed to the new production hostname.

## Application and integration behavior

### Authentication

Telegram Login Widget validation remains token/HMAC based, but BotFather restricts the allowed
web domain. Therefore successful browser rendering is not proof that Telegram login works; an
actual login callback on the new origin is required.

VK ID derives `redirect_uri` from `window.location.origin`. The new callback must be registered
with VK before testing. The old callback stays registered during the parallel-serving phase and
may remain registered for rollback unless the user later requests cleanup.

Access and refresh tokens are stored per browser origin. Users may need to authenticate once on
the new domain; tokens from the old origin cannot be migrated by server code. The redirect does
not copy local storage, IndexedDB, service-worker state, or cookies across origins.

### PWA and cache

The new domain creates a separate PWA origin. Acceptance must cover a clean browser load and a
fresh PWA installation. The legacy service worker cannot control the new origin. Existing users
opening the old installed PWA will follow the redirect in browser-capable flows, but they may
need to install the new PWA for a stable home-screen experience.

### Push notifications

The VAPID key pair is retained, but browser push subscriptions are origin-scoped. Existing
subscriptions created under the old origin cannot be reused as new-origin subscriptions. Users
must grant/enable push on `ultimatehockey.ru`; invalid old subscriptions are handled by the
existing gone-subscription cleanup. Notification deep links must be checked to ensure relative
URLs resolve against the new origin.

### Payments

YooKassa payment creation uses the configured absolute return URL. Production must receive the
new return URL before the first new-origin payment acceptance check. Webhook delivery is API
endpoint based and must be inspected in the merchant configuration if it contains the old host.
No real charge is made without explicit approval; production acceptance may stop at configuration
verification or use an explicitly approved low-value transaction.

### Realtime and API

The frontend uses same-origin `/api` and WebSocket endpoints, so no CORS expansion is expected.
Acceptance nevertheless verifies authenticated HTTP and WebSocket chat because hostname or
proxy mistakes can break upgrades while `/api/health` remains green.

## Verification and acceptance

### Static and local checks

- Validate Caddy configuration syntax with the same Caddy image/version used in deployment.
- Validate both workflow YAML files and assert the expected canonical/legacy/dev hostnames in
  focused workflow tests.
- Run focused server push configuration tests.
- Run repository typecheck, lint, build, and tests required by CI before release.
- Search active runtime/configuration files for unintended production references to the old
  hostname. Historical design and plan documents are excluded from this assertion.

### Phase 1 production acceptance

Evidence must identify the deployed commit SHA and successful GitHub Actions run. Check:

1. DNS answers and valid TLS chain for apex and `www`.
2. `GET https://ultimatehockey.ru/api/health` returns the expected healthy payload.
3. Root HTML, manifest, entry JS, lazy chunks, and static assets load from the new origin.
4. Telegram login completes and `/api/me` succeeds.
5. VK login completes through the new registered callback.
6. Authenticated API requests and refresh-token rotation work.
7. Chat WebSocket reaches `connection:ready`, receives a new message, and reconnects.
8. PWA registration/install works from the new origin with no stale-cache errors.
9. Push permission/subscription can be created on the new origin and an approved test
   notification opens the intended in-app route.
10. YooKassa creates the intended new return URL; any real payment is separately authorized.
11. `https://hockey.inbotwetrust.ru` still works during the parallel phase.
12. `https://dev.hockey.inbotwetrust.ru/api/health` remains healthy and dev-only access remains
    dev-only.

### Phase 2 redirect acceptance

- A request to an old deep link with a query returns a permanent redirect whose `Location`
  exactly preserves the path and query on `ultimatehockey.ru`.
- The canonical host does not redirect back to the legacy host and has no loop.
- API clients should use the canonical hostname directly; the redirect is compatibility, not
  the documented API base URL.
- Production and dev smoke checks pass against their exact intended hosts.

## Rollback

During Phase 1, rollback means restoring the previous Caddy/workflow revision; the old host is
still serving the application and no data migration is involved.

During Phase 2, rollback means changing the legacy Caddy block from redirect back to parallel
serving and redeploying through GitHub Actions. DNS for both hosts remains pointed at the VPS,
so rollback does not depend on DNS propagation. BotFather and VK may retain both allowed hosts
during the compatibility window. YooKassa return URL must be restored only if payment traffic is
intentionally moved back.

No database rollback, image rebuild on the VPS, manual container patch, or production-data copy
is part of this procedure.

## Success criteria

The migration is complete only when:

- `ultimatehockey.ru` is the verified canonical production origin;
- the exact deployed SHA is green in CI/deploy and confirmed by runtime evidence;
- Telegram, VK, authenticated API, WebSocket, PWA, push, and payment return behavior have the
  agreed acceptance evidence;
- the old production hostname redirects indefinitely with path/query preservation;
- the unchanged dev hostname is healthy and isolated from production;
- rollback remains possible through a normal GitHub Actions deployment.
