# Production Domain Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `https://ultimatehockey.ru` the canonical production origin, keep `https://dev.hockey.inbotwetrust.ru` unchanged, and permanently redirect the legacy production host after acceptance.

**Architecture:** Use one shared Caddy configuration with explicit canonical, legacy, `www`, and dev host variables. Release in two stages: first serve production on old and new hosts in parallel, verify origin-sensitive integrations, then deploy a 308 redirect from the old host. DNS and provider-console changes are approval-gated external operations; data, infrastructure, credentials, and VAPID keys do not move.

**Tech Stack:** Caddy 2, Docker Compose, GitHub Actions, TypeScript, Vitest, pnpm, DNS, Telegram BotFather, VK ID, YooKassa

**Spec:** `docs/superpowers/specs/2026-09-12-production-domain-migration-design.md`

## Global Constraints

- Canonical production is exactly `https://ultimatehockey.ru`.
- Legacy production is exactly `https://hockey.inbotwetrust.ru` and redirects indefinitely after acceptance.
- Development remains exactly `https://dev.hockey.inbotwetrust.ru`.
- `www.ultimatehockey.ru` redirects to the apex; redirects preserve path and query.
- No database, Redis, object-storage, VPS, credential, OAuth ID, token, key, game-core, gameplay, timing, or API-contract change.
- Deploy only through GitHub Actions; never build or patch on the VPS.
- Preserve every existing `docker compose ... -T ... < /dev/null` safeguard.
- GLM is prohibited for this repository.
- Runtime claims require exact SHA, matching Actions run, health, and scenario evidence.

## File map

- `packages/server/test/domainRouting.test.ts`: infrastructure routing/workflow contract.
- `packages/server/test/push/service.test.ts`: VAPID fallback contract.
- `Caddyfile`: production proxy snippet and two-phase routing.
- `docker-compose.yml`: shared Caddy hostname environment.
- `.github/workflows/deploy.yml`: canonical production smoke and legacy compatibility/redirect smoke.
- `.github/workflows/deploy-dev.yml`: unchanged dev smoke and shared-Caddy production variables.
- `.env.example`: hostname defaults.
- `packages/server/src/push/service.ts`: canonical VAPID contact fallback.
- `README.md`, `AGENTS.md`, `CLAUDE.md`: active operational URLs.
- `docs/superpowers/runbooks/2026-09-12-production-domain-cutover.md`: evidence and rollback checklist.

## Ручные действия владельца: что и когда делать

Не выполнять всё заранее: после каждого обозначенного `СТОП` дождаться подтверждения агента.

### Этап A — до первого деплоя

1. Открыть DNS-панель зоны `ultimatehockey.ru`.
2. В разделе DNS удалить только парковочную A-запись корня, если она есть. Не менять NS, MX,
   TXT и другие существующие записи.
3. Создать запись корня:

   ```text
   Тип: A
   Имя/Host: @
   IPv4: 217.197.115.116
   TTL: 300 (или минимальный доступный не выше 600)
   ```

4. Создать запись `www`:

   ```text
   Тип: A
   Имя/Host: www
   IPv4: 217.197.115.116
   TTL: 300 (или минимальный доступный не выше 600)
   ```

5. Не создавать `AAAA`: старый рабочий прод на момент планирования не публиковал IPv6.
6. Сохранить и прислать агенту скриншот или текстовый список записей без логинов, токенов и
   резервных кодов.
7. Открыть приложение VK ID с ID из GitHub variable `VITE_VK_APP_ID`.
8. Добавить разрешённый callback `https://ultimatehockey.ru/auth/vk/callback`.
9. Старый callback `https://hockey.inbotwetrust.ru/auth/vk/callback` не удалять.
10. Если production YooKassa уже включена, открыть настройки возврата и webhook, ничего пока не
    менять и прислать текущие URL агенту.

**СТОП A:** написать «DNS и VK готовы» и ждать подтверждения публичного DNS и готовности Phase 1.

### Этап B — только после сообщения агента «новый HTTPS работает»

1. Открыть `https://ultimatehockey.ru` и убедиться, что браузер не показывает предупреждение о
   сертификате. Не обходить предупреждение безопасности.
2. В Telegram открыть `@BotFather` из аккаунта-владельца production-бота.
3. Отправить `/setdomain`, выбрать бота, которого агент сверил с
   `VITE_TELEGRAM_BOT_USERNAME`, и отправить ровно `ultimatehockey.ru`.
4. Сохранить подтверждение BotFather и прислать его без токена бота.
5. Только если агент подтвердил активную production YooKassa, поставить return URL
   `https://ultimatehockey.ru/inventory?tab=bank&payment=return`.
6. Webhook менять только если текущий URL содержит старый домен: заменить только origin на
   `ultimatehockey.ru`, сохранив путь. Shop ID и секретный ключ не менять.

**СТОП B:** написать «BotFather готов» и статус YooKassa: «не подключена», «URL обновлён» или
«нужна помощь». Старый DNS не трогать.

### Этап C — приёмка перед редиректом

1. Открыть `https://ultimatehockey.ru` в приватном окне.
2. Войти через Telegram и убедиться, что открылся правильный профиль.
3. Если VK используется на проде, выйти и один раз войти через VK.
4. Проверить главную/игру, профиль, чат и инвентарь.
5. Отправить тестовое сообщение в чат и увидеть его без перезагрузки.
6. Установить PWA с нового домена. Старую PWA пока не удалять.
7. Если нужны push, разрешить их заново на новом домене.
8. По каждому пункту сообщить `PASS` либо фактическую ошибку со скриншотом.

**СТОП C:** редирект включается только после фразы владельца «новый домен принимаю, включай
редирект» и технического PASS критических проверок.

### Этап D — после сообщения агента «редирект включён»

1. Открыть `https://hockey.inbotwetrust.ru/inventory?tab=bank`.
2. Убедиться, что адрес стал `https://ultimatehockey.ru/inventory?tab=bank` и приложение работает.
3. Проверить старую закладку, если она есть.
4. Проверить новую PWA; после стабильной работы старую PWA можно удалить.
5. Не удалять DNS старого домена: он нужен для бессрочного редиректа.

### Этап E — не раньше чем через 24 часа стабильной работы

1. В DNS-панели поднять TTL A-записей `@` и `www` с 300 до 3600 секунд.
2. Не менять IP, NS, старый домен или dev-домен.
3. Сообщить агенту, что TTL поднят.

---

### Task 1: Add failing Phase 1 routing and VAPID contracts

**Files:**
- Create: `packages/server/test/domainRouting.test.ts`
- Modify: `packages/server/test/push/service.test.ts`

**Interfaces:**
- Consumes: repository files as UTF-8; `resolvePushVapidOptions(options)`.
- Produces: exact failing contract for four hosts and canonical VAPID subject.

- [ ] **Step 1: Create the routing contract**

Create `packages/server/test/domainRouting.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function repoFile(path: string): string {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
}

const caddy = repoFile('Caddyfile');
const compose = repoFile('docker-compose.yml');
const prod = repoFile('.github/workflows/deploy.yml');
const dev = repoFile('.github/workflows/deploy-dev.yml');

describe('production domain migration phase 1', () => {
  it('serves canonical and legacy production while redirecting www', () => {
    expect(caddy).toContain('{$APP_DOMAIN}, {$LEGACY_APP_DOMAIN}');
    expect(caddy).toContain('{$WWW_APP_DOMAIN}');
    expect(caddy).toContain('redir https://{$APP_DOMAIN}{uri} 308');
    expect(caddy).toContain('{$DEV_APP_DOMAIN}');
  });

  it('gives shared Caddy safe hostname defaults', () => {
    expect(compose).toContain('APP_DOMAIN: ${APP_DOMAIN:-ultimatehockey.ru}');
    expect(compose).toContain(
      'LEGACY_APP_DOMAIN: ${LEGACY_APP_DOMAIN:-hockey.inbotwetrust.ru}',
    );
    expect(compose).toContain('WWW_APP_DOMAIN: ${WWW_APP_DOMAIN:-www.ultimatehockey.ru}');
    expect(compose).toContain(
      'DEV_APP_DOMAIN: ${DEV_APP_DOMAIN:-dev.hockey.inbotwetrust.ru}',
    );
  });

  it('uses the canonical production smoke and explicit legacy host', () => {
    expect(prod).toContain('APP_DOMAIN: ultimatehockey.ru');
    expect(prod).toContain('LEGACY_APP_DOMAIN: hockey.inbotwetrust.ru');
    expect(prod).toContain('WWW_APP_DOMAIN: www.ultimatehockey.ru');
    expect(prod).toContain('HEALTH_URL: https://ultimatehockey.ru/api/health');
    expect(prod).toContain('LEGACY_URL: https://hockey.inbotwetrust.ru');
  });

  it('keeps dev unchanged and preserves production hosts for shared Caddy', () => {
    expect(dev).toContain('DEV_APP_DOMAIN: dev.hockey.inbotwetrust.ru');
    expect(dev).toContain('HEALTH_URL: https://dev.hockey.inbotwetrust.ru/api/health');
    expect(dev).toContain('APP_DOMAIN: ultimatehockey.ru');
    expect(dev).toContain('LEGACY_APP_DOMAIN: hockey.inbotwetrust.ru');
    expect(dev).toContain('WWW_APP_DOMAIN: www.ultimatehockey.ru');
  });
});
```

- [ ] **Step 2: Add the VAPID fallback assertion**

Add to `packages/server/test/push/service.test.ts`:

```ts
it('uses the canonical production domain as the default VAPID contact', () => {
  expect(resolvePushVapidOptions({ publicKey: 'public', privateKey: 'private' })).toEqual({
    publicKey: 'public',
    privateKey: 'private',
    subject: 'mailto:push@ultimatehockey.ru',
  });
});
```

- [ ] **Step 3: Prove the tests fail for the intended reasons**

```bash
pnpm --filter @hockey/server exec vitest run \
  test/domainRouting.test.ts test/push/service.test.ts
```

Expected: routing assertions fail on absent host wiring; VAPID assertion reports the old subject.

- [ ] **Step 4: Commit the failing contract**

```bash
git add packages/server/test/domainRouting.test.ts packages/server/test/push/service.test.ts
git commit -m "test: define production domain migration contract"
```

---

### Task 2: Implement Phase 1 parallel routing

**Files:**
- Modify: `Caddyfile`
- Modify: `docker-compose.yml`
- Modify: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/deploy-dev.yml`
- Modify: `.env.example`
- Modify: `packages/server/src/push/service.ts`

**Interfaces:**
- Consumes: `APP_DOMAIN`, `LEGACY_APP_DOMAIN`, `WWW_APP_DOMAIN`, `DEV_APP_DOMAIN`.
- Produces: old+new production service, `www` 308, separate unchanged dev service.

- [ ] **Step 1: Extract the production Caddy snippet**

Use this production portion, retaining the existing dev block with `server-dev:3000` and `web-dev:8080`:

```caddyfile
(production_app) {
  encode gzip zstd
  handle_path /api/* {
    reverse_proxy server:3000
  }
  handle {
    reverse_proxy web:8080
  }
  log {
    output stdout
    format console
  }
}

{$APP_DOMAIN}, {$LEGACY_APP_DOMAIN} {
  import production_app
}

{$WWW_APP_DOMAIN} {
  redir https://{$APP_DOMAIN}{uri} 308
}
```

- [ ] **Step 2: Add safe Caddy environment defaults**

Replace only hostname entries under `caddy.environment` in `docker-compose.yml`:

```yaml
APP_DOMAIN: ${APP_DOMAIN:-ultimatehockey.ru}
LEGACY_APP_DOMAIN: ${LEGACY_APP_DOMAIN:-hockey.inbotwetrust.ru}
WWW_APP_DOMAIN: ${WWW_APP_DOMAIN:-www.ultimatehockey.ru}
DEV_APP_DOMAIN: ${DEV_APP_DOMAIN:-dev.hockey.inbotwetrust.ru}
```

- [ ] **Step 3: Wire production workflow hosts**

Set top-level production workflow values:

```yaml
APP_DOMAIN: ultimatehockey.ru
LEGACY_APP_DOMAIN: hockey.inbotwetrust.ru
WWW_APP_DOMAIN: www.ultimatehockey.ru
HEALTH_URL: https://ultimatehockey.ru/api/health
LEGACY_URL: https://hockey.inbotwetrust.ru
```

Pass the three hostname variables into the production SSH step and remote `export`. Change the VAPID default to:

```yaml
PUSH_VAPID_SUBJECT: ${{ vars.PUSH_VAPID_SUBJECT || 'mailto:push@ultimatehockey.ru' }}
```

After canonical frontend smoke, add Phase 1 compatibility smoke:

```bash
legacy_health="$(curl -fsSL --max-time 10 "$LEGACY_URL/api/health")"
printf '%s' "$legacy_health" | grep -q '"ok":true'
echo "Legacy production host serves the app during phase 1"
```

- [ ] **Step 4: Make dev preserve shared-Caddy production hosts**

Add the same `APP_DOMAIN`, `LEGACY_APP_DOMAIN`, and `WWW_APP_DOMAIN` values to
`.github/workflows/deploy-dev.yml`; pass them with `DEV_APP_DOMAIN` through SSH and remote
`export`. Do not change dev images, database, return URL, upstreams, or health URL.

- [ ] **Step 5: Update defaults**

In `.env.example` document:

```dotenv
APP_DOMAIN=ultimatehockey.ru
LEGACY_APP_DOMAIN=hockey.inbotwetrust.ru
WWW_APP_DOMAIN=www.ultimatehockey.ru
DEV_APP_DOMAIN=dev.hockey.inbotwetrust.ru
```

In `packages/server/src/push/service.ts` use:

```ts
const DEFAULT_VAPID_SUBJECT = 'mailto:push@ultimatehockey.ru';
```

- [ ] **Step 6: Run focused tests**

```bash
pnpm --filter @hockey/server exec vitest run \
  test/domainRouting.test.ts test/deployDevWorkflow.test.ts test/push/service.test.ts
```

Expected: PASS, including unchanged dev YooKassa return URL.

- [ ] **Step 7: Validate Caddy syntax**

```bash
docker run --rm \
  -e ADMIN_EMAIL=admin@ultimatehockey.ru \
  -e APP_DOMAIN=ultimatehockey.ru \
  -e LEGACY_APP_DOMAIN=hockey.inbotwetrust.ru \
  -e WWW_APP_DOMAIN=www.ultimatehockey.ru \
  -e DEV_APP_DOMAIN=dev.hockey.inbotwetrust.ru \
  -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
```

Expected: exit 0 and `Valid configuration`.

- [ ] **Step 8: Commit Phase 1**

```bash
git add Caddyfile docker-compose.yml .github/workflows/deploy.yml \
  .github/workflows/deploy-dev.yml .env.example packages/server/src/push/service.ts
git commit -m "feat: add parallel production domain routing"
```

---

### Task 3: Add active docs and cutover runbook

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Create: `docs/superpowers/runbooks/2026-09-12-production-domain-cutover.md`

**Interfaces:**
- Consumes: approved hostname/phase policy.
- Produces: operator checklist recording expected/actual and PASS/FAIL/BLOCKED.

- [ ] **Step 1: Update active URL documentation**

Document canonical prod, permanent legacy redirect, unchanged dev, and Actions-only deployment.
Do not rewrite historical specs/plans.

- [ ] **Step 2: Create the runbook**

The runbook must contain checkboxes and evidence fields for:

- exact canonical/legacy/dev hosts;
- old-host IPv4 resolution;
- apex and `www` DNS at public resolvers;
- absence of unverified AAAA;
- VK callback registration;
- BotFather domain switch;
- YooKassa return/webhook inspection;
- Phase 1 and Phase 2 SHA and Actions run URLs;
- TLS issuer/expiry;
- canonical, legacy, and dev health;
- Telegram, VK, `/api/me`, refresh rotation, WebSocket `connection:ready`/message/reconnect,
  PWA install, push subscription/delivery, and payment return as PASS/FAIL/BLOCKED;
- rollback: revert only the Phase 2 redirect commit and deploy normally.

Include these exact probes:

```bash
dig @1.1.1.1 +short A ultimatehockey.ru
dig @8.8.8.8 +short A www.ultimatehockey.ru
curl -fsS https://ultimatehockey.ru/api/health
curl -fsS https://dev.hockey.inbotwetrust.ru/api/health
curl -sS -o /dev/null -D - \
  'https://hockey.inbotwetrust.ru/inventory?tab=bank'
```

Expected final legacy `Location`:
`https://ultimatehockey.ru/inventory?tab=bank`.

- [ ] **Step 3: Audit active references**

```bash
rg -n "hockey\.inbotwetrust\.ru|ultimatehockey\.ru" \
  README.md AGENTS.md CLAUDE.md .env.example Caddyfile docker-compose.yml \
  .github/workflows packages/server/src/push packages/server/test/domainRouting.test.ts
```

Expected: old prod references mean legacy/compatibility; dev references remain unchanged.

- [ ] **Step 4: Commit docs**

```bash
git add README.md AGENTS.md CLAUDE.md \
  docs/superpowers/runbooks/2026-09-12-production-domain-cutover.md
git commit -m "docs: add production domain cutover runbook"
```

---

### Task 4: Run pre-release verification

**Files:** Verify only.

**Interfaces:**
- Consumes: Phase 1 candidate.
- Produces: local evidence and exact candidate SHA.

- [ ] **Step 1: Install locked dependencies and build game-core**

```bash
pnpm install --frozen-lockfile
pnpm --filter @hockey/game-core build
```

Expected: exit 0, no lockfile change.

- [ ] **Step 2: Run CI-equivalent checks**

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
```

Expected: exit 0. Report unavailable integration suites as SKIPPED, never PASS.

- [ ] **Step 3: Review scope and record SHA**

```bash
git diff --check origin/dev...HEAD
git diff --stat origin/dev...HEAD
git log --oneline origin/dev..HEAD
git rev-parse HEAD
```

Expected: only planned files; no secrets, DB migrations, unrelated gameplay, or credential changes.
Record the full SHA in the runbook.

---

### Task 5: Complete approval-gated external preflight

**Files:** Update evidence in the runbook only.

**Interfaces:**
- Consumes: authorized registrar/DNS, VK ID, BotFather, and optionally YooKassa access.
- Produces: propagated DNS and provider allowlists ready for acceptance.

- [ ] **Step 1: Revalidate the current production IP**

```bash
dig @1.1.1.1 +short A hockey.inbotwetrust.ru | sort -u
dig @8.8.8.8 +short A hockey.inbotwetrust.ru | sort -u
```

Expected at plan-writing time: `217.197.115.116`. If either differs, stop and resolve identity.

- [ ] **Step 2: Create exact DNS records after user authorization**

```text
ultimatehockey.ru.      A      217.197.115.116   TTL 300
www.ultimatehockey.ru.  A      217.197.115.116   TTL 300
```

Do not create AAAA: the old host had no public AAAA at plan-writing time.

- [ ] **Step 3: Verify propagation**

```bash
dig @1.1.1.1 +short A ultimatehockey.ru
dig @8.8.8.8 +short A ultimatehockey.ru
dig @1.1.1.1 +short A www.ultimatehockey.ru
dig @8.8.8.8 +short A www.ultimatehockey.ru
```

Expected: all return only `217.197.115.116`.

- [ ] **Step 4: Register VK callback**

Add exactly `https://ultimatehockey.ru/auth/vk/callback`; retain the old callback for rollback.
Read the setting back and record evidence.

- [ ] **Step 5: Inspect YooKassa production state**

At plan-writing time, current `origin/dev` has YooKassa only in staging. Re-check after rebase:

- if still disabled in prod, record `N/A: production YooKassa disabled`;
- if enabled, set exactly
  `https://ultimatehockey.ru/inventory?tab=bank&payment=return`, inspect webhook hostname, and
  do not change shop ID or secret.

- [ ] **Step 6: Confirm BotFather ownership**

Confirm the exact production bot from `VITE_TELEGRAM_BOT_USERNAME`. Do not switch yet.

---

### Task 6: Release and accept Phase 1

**Files:** Update runbook evidence only.

**Interfaces:**
- Consumes: verified Phase 1, propagated DNS, VK callback.
- Produces: accepted dual-host production.

- [ ] **Step 1: Rebase/port onto fresh `origin/dev`, rerun Task 4, and push**

```bash
git fetch origin dev
git push origin HEAD:dev
```

Expected: non-force push. If dev advanced, reconcile safely and rerun all checks first.

- [ ] **Step 2: Watch the exact dev deploy**

```bash
candidate_sha="$(git rev-parse HEAD)"
dev_run_id="$(gh run list --branch dev --limit 6 \
  --json databaseId,workflowName,headSha \
  --jq ".[] | select(.workflowName == \"Deploy Dev\" and .headSha == \"$candidate_sha\") | .databaseId" \
  | head -1)"
test -n "$dev_run_id"
gh run watch "$dev_run_id" --exit-status
```

Use the numeric ID whose `headSha` exactly matches. Record SHA/URL/conclusion.

- [ ] **Step 3: Verify shared Caddy without calling it prod acceptance**

```bash
curl -fsS https://dev.hockey.inbotwetrust.ru/api/health
curl -fsSIL --max-time 15 https://ultimatehockey.ru/
curl -fsSIL --max-time 15 https://www.ultimatehockey.ru/
```

Expected: dev healthy, apex TLS works, `www` returns 308 to apex.

- [ ] **Step 4: Promote reviewed dev to main and watch exact prod deploy**

Use the normal reviewed `dev` → `main` PR/merge. Then:

```bash
main_sha="$(git rev-parse origin/main)"
prod_run_id="$(gh run list --branch main --limit 10 \
  --json databaseId,workflowName,headSha \
  --jq ".[] | select(.workflowName == \"Deploy\" and .headSha == \"$main_sha\") | .databaseId" \
  | head -1)"
test -n "$prod_run_id"
gh run watch "$prod_run_id" --exit-status
```

Expected: matching SHA; build, migrations, recreation, API smoke, and frontend smoke succeed.

- [ ] **Step 5: Switch BotFather after canonical health is green**

For the confirmed production bot, set exactly `ultimatehockey.ru` using `/setdomain`.
This requires explicit approval for the exact bot at execution time. Record BotFather response.

- [ ] **Step 6: Perform rendered Phase 1 acceptance**

Verify and record expected/actual plus PASS/FAIL/BLOCKED for:

1. canonical and legacy health;
2. Telegram login and authenticated `/api/me`;
3. VK callback login;
4. refresh-token rotation;
5. WebSocket ready/message/reconnect;
6. fresh PWA registration/install;
7. new-origin push subscription and approved test delivery;
8. YooKassa as verified return URL or explicit N/A;
9. unchanged dev health and dev-only access.

Do not infer these from source or health alone.

- [ ] **Step 7: Gate Phase 2**

Require canonical TLS/API/frontend and both applicable login flows PASS, plus healthy dev. Do not
redirect legacy traffic while a critical access blocker remains.

---

### Task 7: Implement the isolated Phase 2 redirect commit

**Files:**
- Modify: `Caddyfile`
- Modify: `.github/workflows/deploy.yml`
- Modify: `packages/server/test/domainRouting.test.ts`

**Interfaces:**
- Consumes: accepted canonical origin.
- Produces: apex production plus 308 legacy/`www` aliases.

- [ ] **Step 1: Change the test first**

Replace the Phase 1 routing assertion with:

```ts
it('serves only canonical production and redirects legacy aliases', () => {
  expect(caddy).toContain('{$APP_DOMAIN} {');
  expect(caddy).toContain('{$LEGACY_APP_DOMAIN}, {$WWW_APP_DOMAIN}');
  expect(caddy).toContain('redir https://{$APP_DOMAIN}{uri} 308');
  expect(caddy).not.toContain('{$APP_DOMAIN}, {$LEGACY_APP_DOMAIN}');
  expect(caddy).toContain('{$DEV_APP_DOMAIN}');
});
```

Run `pnpm --filter @hockey/server exec vitest run test/domainRouting.test.ts`.
Expected: FAIL because Phase 1 still serves legacy directly.

- [ ] **Step 2: Activate redirect**

Use:

```caddyfile
{$APP_DOMAIN} {
  import production_app
}

{$LEGACY_APP_DOMAIN}, {$WWW_APP_DOMAIN} {
  redir https://{$APP_DOMAIN}{uri} 308
}
```

- [ ] **Step 3: Replace legacy health smoke with redirect smoke**

```bash
legacy_probe_path='/inventory?tab=bank'
legacy_headers="$(curl -sS -o /dev/null -D - --max-time 10 \
  "$LEGACY_URL$legacy_probe_path")"
printf '%s\n' "$legacy_headers"
printf '%s' "$legacy_headers" | grep -Eq '^HTTP/[^ ]+ 308'
printf '%s' "$legacy_headers" | tr -d '\r' | grep -Fxq \
  "Location: https://$APP_DOMAIN$legacy_probe_path"
```

- [ ] **Step 4: Verify and commit**

Run focused tests from Task 2, Caddy validation from Task 2, and `git diff --check`. Then:

```bash
git add Caddyfile .github/workflows/deploy.yml packages/server/test/domainRouting.test.ts
git commit -m "feat: redirect legacy production domain"
```

This commit must contain only redirect activation so rollback is a simple revert.

---

### Task 8: Release Phase 2 and close migration

**Files:** Update runbook evidence only.

**Interfaces:**
- Consumes: accepted Phase 1 and isolated redirect commit.
- Produces: canonical prod, permanent redirects, unchanged dev, rollback evidence.

- [ ] **Step 1: Release through dev after Phase 1 acceptance**

Push through the normal dev path and watch the exact SHA. Because dev deploy recreates shared
Caddy, the production redirect may activate during this deploy; Phase 1 acceptance must already
be complete.

- [ ] **Step 2: Verify dev and legacy redirect**

```bash
curl -fsS https://dev.hockey.inbotwetrust.ru/api/health
curl -sS -o /dev/null -D - \
  'https://hockey.inbotwetrust.ru/inventory?tab=bank'
```

Expected: dev healthy; legacy 308 to
`https://ultimatehockey.ru/inventory?tab=bank`.

- [ ] **Step 3: Promote to main and watch exact production SHA**

Use reviewed dev → main promotion and the exact-run selection commands from Task 6. Require green
canonical API/frontend and legacy redirect smoke.

- [ ] **Step 4: Verify runtime independently**

```bash
curl -fsS https://ultimatehockey.ru/api/health
curl -sS -o /dev/null -D - \
  'https://hockey.inbotwetrust.ru/inventory?tab=bank'
curl -sS -o /dev/null -D - \
  'https://www.ultimatehockey.ru/inventory?tab=bank'
curl -fsS https://dev.hockey.inbotwetrust.ru/api/health
```

Expected: canonical/dev health contain `"ok":true`; both aliases return 308 with the exact apex
`Location`; dev does not redirect.

- [ ] **Step 5: Repeat critical rendered acceptance**

Verify clean load, authenticated reload, Telegram/VK login as applicable, authenticated API,
WebSocket readiness, and PWA behavior. Record PASS/FAIL/BLOCKED. Workflow green is not rendered
production acceptance.

- [ ] **Step 6: Stabilize DNS and report**

After 24 hours without a domain incident, raise apex/`www` TTL from 300 to 3600 seconds. Keep
legacy DNS and redirect indefinitely. Final report must include both SHAs, both Actions URLs,
DNS/TLS evidence, every scenario status, YooKassa PASS/N/A/BLOCKED, and rollback procedure.
