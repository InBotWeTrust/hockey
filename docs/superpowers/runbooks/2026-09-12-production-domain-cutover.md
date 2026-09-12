# Production domain cutover runbook

## Recorded identities

- Canonical production: `ultimatehockey.ru`
- Legacy production: `hockey.inbotwetrust.ru`
- Development: `dev.hockey.inbotwetrust.ru`
- Production VPS IPv4: `217.197.115.116`
- Registrar: REG.RU
- Authoritative DNS: `ns1.reg.ru`, `ns2.reg.ru`

## Phase 0: DNS and provider preflight

- [x] WHOIS state is `REGISTERED, DELEGATED, VERIFIED` (2026-09-12).
- [x] `ultimatehockey.ru` A is `217.197.115.116` through public Google DNS.
- [x] `www.ultimatehockey.ru` A is `217.197.115.116` through public Google DNS.
- [x] No apex or `www` AAAA record is published.
- [ ] VK ID allows `https://ultimatehockey.ru/auth/vk/callback` and retains the legacy callback.
- [ ] BotFather `/setdomain` is set to `ultimatehockey.ru` after the new TLS endpoint is healthy.
- [x] Production YooKassa return URL in the active deploy workflow is `https://ultimatehockey.ru/inventory?tab=bank&payment=return` when production credentials are configured.
- [ ] YooKassa merchant-side webhook/return settings have been inspected for the legacy hostname.

DNS verification commands:

```bash
dig @1.1.1.1 +short A ultimatehockey.ru
dig @8.8.8.8 +short A www.ultimatehockey.ru
dig @1.1.1.1 +short AAAA ultimatehockey.ru
dig @8.8.8.8 +short AAAA www.ultimatehockey.ru
```

## Phase 1: parallel-serving release evidence

- Candidate commit SHA:
- Dev Actions run URL and conclusion:
- Production commit SHA:
- Production Actions run URL and conclusion:
- `curl -fsS https://ultimatehockey.ru/api/health`:
- `curl -fsS https://hockey.inbotwetrust.ru/api/health`:
- `curl -fsS https://dev.hockey.inbotwetrust.ru/api/health`:
- TLS issuer/expiry for apex:
- TLS issuer/expiry for `www`:

## Origin-sensitive acceptance

- [ ] Telegram login and authenticated `/api/me`: PASS/FAIL/BLOCKED with evidence.
- [ ] VK ID callback login: PASS/FAIL/BLOCKED with evidence.
- [ ] Refresh-token rotation: PASS/FAIL/BLOCKED with evidence.
- [ ] WebSocket `connection:ready`, message, reconnect: PASS/FAIL/BLOCKED with evidence.
- [ ] Fresh PWA registration/install: PASS/FAIL/BLOCKED with evidence.
- [ ] New-origin push subscription and approved test delivery: PASS/FAIL/BLOCKED with evidence.
- [ ] YooKassa return behavior: PASS/N/A/BLOCKED with evidence.
- [ ] Dev health and dev-only access isolation: PASS/FAIL/BLOCKED with evidence.

## Phase 2: redirect evidence

- Redirect commit SHA:
- Dev Actions run URL and conclusion:
- Production commit SHA:
- Production Actions run URL and conclusion:

```bash
curl -sS -o /dev/null -D - \
  'https://hockey.inbotwetrust.ru/inventory?tab=bank'
curl -sS -o /dev/null -D - \
  'https://www.ultimatehockey.ru/inventory?tab=bank'
```

Expected `Location` for both:

```text
https://ultimatehockey.ru/inventory?tab=bank
```

- Canonical health output:
- Dev health output:
- Rendered clean-load/authenticated-reload acceptance:

## Rollback

Revert only the Phase 2 redirect commit, push through the normal `dev` then `main` release path,
watch the exact matching GitHub Actions runs, and verify both production hosts serve
`/api/health`. Do not edit containers, images, databases, or Caddy directly on the VPS.

Keep the legacy DNS record indefinitely so rollback and old links do not depend on DNS
propagation.
