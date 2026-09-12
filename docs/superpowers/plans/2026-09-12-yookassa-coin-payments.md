# YooKassa Coin Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver database-backed coin packages, a public prices page, editable package administration, and exactly-once YooKassa test payments on dev.

**Architecture:** A focused `payments/` server module owns the package catalog, provider client, creation flow, webhook reconciliation, and balance credit. React clients consume the same public catalog API; authenticated Bank starts payments, while admin endpoints edit catalog and inspect payment snapshots.

**Tech Stack:** TypeScript, Fastify 4, PostgreSQL 16 raw SQL migrations, React 18, TanStack Query, Vitest, Testing Library, native Node `fetch`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-12-yookassa-coin-payments-design.md`

## Global Constraints

- Dev uses YooKassa test shop only; do not add or change production credentials.
- `/prices` is public and informational, with no login, registration, or purchase controls.
- Payment creation is authenticated and available only from the in-app Bank.
- Provider callbacks and return navigation never directly determine the credited amount.
- Credit coins exactly once from the immutable local snapshot after authenticated provider verification.
- Keep credentials server-side and out of Git, logs, Vite, API responses, and payment metadata.
- Preserve existing manual/inventory payment rows and admin analytics.
- Follow the global economy lock order: `users` before `user_currency_account`.
- Use existing modal, icon-button, and text-button design invariants.
- GLM review is prohibited for this repository.

---

### Task 1: Persist and expose the canonical coin-package catalog

**Files:**
- Create: `packages/server/db/migrations/131_yookassa_coin_packages.sql`
- Create: `packages/server/src/payments/catalog.ts`
- Create: `packages/server/src/payments/routes.ts`
- Create: `packages/server/test/payments/catalog.test.ts`
- Modify: `packages/server/src/app.ts`

**Interfaces:**
- Produces: `CoinPackageDTO`, `listActiveCoinPackages(pool)`, and public `GET /bank/packages` returning `{ packages: CoinPackageDTO[] }`.
- Consumes: existing Fastify `app.pg` pool and `AppError` conventions.

- [ ] **Step 1: Write migration and route tests that fail before the catalog exists**

```ts
expect((await app.inject({ method: 'GET', url: '/bank/packages' })).json().packages).toEqual([
  expect.objectContaining({ slug: 'starter', coinAmount: 7450, priceRub: 149 }),
  expect.objectContaining({ slug: 'maximum', coinAmount: 700000, priceRub: 9990 }),
]);
```

- [ ] **Step 2: Run the focused test and confirm the missing route/table failure**

Run: `pnpm --filter @hockey/server test -- test/payments/catalog.test.ts`
Expected: FAIL with route `404` or relation `coin_packages` missing.

- [ ] **Step 3: Add `coin_packages` and seed all seven current Bank packages**

```sql
create table coin_packages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null check (btrim(title) <> ''),
  description text not null default '',
  coin_amount bigint not null check (coin_amount > 0),
  price_rub int not null check (price_rub > 0),
  badge_text text,
  marker text check (marker in ('hit', 'top', 'premium')),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- [ ] **Step 4: Implement catalog mapping and the unauthenticated route**

```ts
export interface CoinPackageDTO {
  id: string; slug: string; title: string; description: string;
  coinAmount: number; priceRub: number; badgeText: string | null;
  marker: 'hit' | 'top' | 'premium' | null; sortOrder: number;
}
```

- [ ] **Step 5: Run migration-backed catalog tests**

Run: `pnpm --filter @hockey/server test -- test/payments/catalog.test.ts`
Expected: PASS; only active rows are returned in stable order.

- [ ] **Step 6: Commit the catalog slice**

```bash
git add packages/server/db/migrations/131_yookassa_coin_packages.sql packages/server/src/payments packages/server/src/app.ts packages/server/test/payments/catalog.test.ts
git commit -m "feat: add coin package catalog"
```

### Task 2: Add provider configuration and a testable YooKassa client

**Files:**
- Create: `packages/server/src/payments/yookassaClient.ts`
- Create: `packages/server/test/payments/yookassaClient.test.ts`
- Modify: `packages/server/src/config.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `YooKassaClient` with `createPayment(input, idempotencyKey)` and `getPayment(providerPaymentId)`.
- Produces config fields `YOOKASSA_SHOP_ID?`, `YOOKASSA_SECRET_KEY?`, and `YOOKASSA_RETURN_URL?`, all-or-none validated.

- [ ] **Step 1: Write failing config and HTTP request-shape tests**

```ts
await client.createPayment({ amountRub: 299, description: 'Малый запас', localPaymentId }, 'attempt-id');
expect(fetchMock).toHaveBeenCalledWith('https://api.yookassa.ru/v3/payments', expect.objectContaining({
  method: 'POST',
  headers: expect.objectContaining({ 'Idempotence-Key': 'attempt-id' }),
}));
```

- [ ] **Step 2: Run tests and observe missing config/client failures**

Run: `pnpm --filter @hockey/server test -- test/config.test.ts test/payments/yookassaClient.test.ts`
Expected: FAIL because the new config and client do not exist.

- [ ] **Step 3: Implement Basic-auth provider requests with safe error translation**

```ts
export interface YooKassaClient {
  createPayment(input: CreateYooKassaPaymentInput, idempotencyKey: string): Promise<YooKassaPayment>;
  getPayment(providerPaymentId: string): Promise<YooKassaPayment>;
}
```

Use injected `fetch` in tests; never log Authorization or full response bodies.

- [ ] **Step 4: Run focused tests and commit**

Run: `pnpm --filter @hockey/server test -- test/config.test.ts test/payments/yookassaClient.test.ts`
Expected: PASS for complete config, absent config, incomplete-config rejection, request body, idempotency header, and sanitized failures.

```bash
git add packages/server/src/config.ts packages/server/src/payments/yookassaClient.ts packages/server/test/payments/yookassaClient.test.ts .env.example
git commit -m "feat: add YooKassa provider client"
```

### Task 3: Create authenticated payment attempts from package snapshots

**Files:**
- Modify: `packages/server/db/migrations/131_yookassa_coin_packages.sql`
- Create: `packages/server/src/payments/service.ts`
- Create: `packages/server/test/payments/createPayment.test.ts`
- Modify: `packages/server/src/payments/routes.ts`
- Modify: `packages/server/src/app.ts`

**Interfaces:**
- Consumes: `YooKassaClient.createPayment`, authenticated `req.user.id`, and `packageId`.
- Produces: `POST /bank/payments` with body `{ packageId: string, attemptId: string }` and response `{ paymentId, status, confirmationUrl }`.

- [ ] **Step 1: Add failing tests for authentication, snapshots, stale packages, and retries**

```ts
expect(providerInput).toMatchObject({ amountRub: 699, localPaymentId: expect.any(String) });
expect(secondResponse.json().paymentId).toBe(firstResponse.json().paymentId);
expect(providerCreateCalls).toHaveLength(1);
```

- [ ] **Step 2: Run the creation tests and confirm failure**

Run: `pnpm --filter @hockey/server test -- test/payments/createPayment.test.ts`
Expected: FAIL because the endpoint and snapshot columns are absent.

- [ ] **Step 3: Extend `payments` without breaking legacy rows**

```sql
alter table payments add column coin_package_id uuid references coin_packages(id) on delete set null;
alter table payments add column coin_amount bigint check (coin_amount is null or coin_amount > 0);
alter table payments add column purchase_attempt_id uuid;
create unique index payments_user_attempt_unique_idx on payments(user_id, purchase_attempt_id)
  where purchase_attempt_id is not null;
alter table currency_ledger add column payment_id uuid references payments(id) on delete set null;
create unique index currency_ledger_payment_unique_idx on currency_ledger(payment_id)
  where payment_id is not null;
```

- [ ] **Step 4: Implement local-first creation and provider attachment**

Insert snapshot values before the provider call, call YooKassa with the local payment UUID as metadata, then persist `provider_payment_id`. Reuse the same row/provider result for the same user and `attemptId`; reject inactive packages server-side.

- [ ] **Step 5: Run concurrency/retry tests and commit**

Run: `pnpm --filter @hockey/server test -- test/payments/createPayment.test.ts`
Expected: PASS, including two concurrent submissions with one local attempt and one provider creation.

```bash
git add packages/server/db/migrations/131_yookassa_coin_packages.sql packages/server/src/payments packages/server/src/app.ts packages/server/test/payments/createPayment.test.ts
git commit -m "feat: create YooKassa coin payments"
```

### Task 4: Reconcile webhooks and credit coins exactly once

**Files:**
- Modify: `packages/server/src/payments/service.ts`
- Modify: `packages/server/src/payments/routes.ts`
- Create: `packages/server/test/payments/webhook.test.ts`

**Interfaces:**
- Produces: public `POST /bank/payments/yookassa/webhook` returning `{ ok: true }` after reconciliation.
- Produces: `reconcileYooKassaPayment(pool, client, providerPaymentId): Promise<void>`.

- [ ] **Step 1: Write failing success, duplicate, cancellation, mismatch, and concurrency tests**

```ts
await Promise.all([sendSucceededWebhook(), sendSucceededWebhook()]);
expect(await balanceFor(userId)).toBe(startingBalance + snapshotCoins);
expect(await purchaseLedgerCount(localPaymentId)).toBe(1);
```

- [ ] **Step 2: Run the webhook tests and confirm no credit occurs yet**

Run: `pnpm --filter @hockey/server test -- test/payments/webhook.test.ts`
Expected: FAIL because reconciliation is unimplemented.

- [ ] **Step 3: Implement authenticated provider re-read and strict matching**

Verify provider ID, `status`, amount with two decimal places, `RUB`, and `metadata.local_payment_id`. Reject or leave pending on any mismatch.

- [ ] **Step 4: Implement the locked credit transaction**

```sql
select id from users where id = $1 for update;
select * from payments where id = $2 for update;
insert into user_currency_account (user_id) values ($1) on conflict do nothing;
select balance, reserved_balance from user_currency_account where user_id = $1 for update;
```

Update the account, insert `currency_ledger` with `reason='purchase'`, set its dedicated unique `payment_id` to the local payment UUID, keep the provider ID in metadata, then mark the payment paid in the same transaction. The unique `currency_ledger.payment_id` index makes a second credit for the same local payment structurally impossible.

- [ ] **Step 5: Run webhook tests and commit**

Run: `pnpm --filter @hockey/server test -- test/payments/webhook.test.ts`
Expected: PASS with one credit under duplicate/concurrent delivery, no credit on cancellation or mismatch, and safe retry after provider outage.

```bash
git add packages/server/src/payments packages/server/test/payments/webhook.test.ts packages/server/db/migrations/131_yookassa_coin_packages.sql
git commit -m "feat: credit YooKassa payments exactly once"
```

### Task 5: Replace Bank constants with catalog and payment APIs

**Files:**
- Create: `packages/web/src/api/payments.ts`
- Modify: `packages/web/src/screens/InventoryScreen.tsx`
- Modify: `packages/web/src/screens/InventoryScreen.test.tsx`

**Interfaces:**
- Consumes: `GET /bank/packages`, `POST /bank/payments`.
- Produces: `fetchCoinPackages()`, `createCoinPayment(packageId, attemptId)`, and Bank redirect/status UI.

- [ ] **Step 1: Replace test fixtures with seven API packages and write failing interaction tests**

```ts
fireEvent.click(await screen.findByRole('button', { name: /Купить 40 000 монет за 699/ }));
expect(createPayment).toHaveBeenCalledWith(packageId, expect.any(String));
expect(locationAssign).toHaveBeenCalledWith('https://yoomoney.ru/checkout/...');
```

- [ ] **Step 2: Run the focused UI tests and confirm they fail**

Run: `pnpm --filter @hockey/web test -- src/screens/InventoryScreen.test.tsx`
Expected: FAIL while `BANK_PACKAGES` remains local and buttons are disabled.

- [ ] **Step 3: Add the typed API and TanStack catalog query**

```ts
export type CoinPackage = { id: string; slug: string; title: string; description: string; coinAmount: number; priceRub: number; badgeText: string | null; marker: 'hit' | 'top' | 'premium' | null; sortOrder: number };
```

- [ ] **Step 4: Implement purchase creation, in-flight guard, redirect, and return notices**

Use `crypto.randomUUID()` once per deliberate click, disable only the active package action, and invalidate profile/history queries after `?payment=return` polling reports a terminal status.

- [ ] **Step 5: Run UI tests and commit**

Run: `pnpm --filter @hockey/web test -- src/screens/InventoryScreen.test.tsx`
Expected: PASS for catalog render, disabled state, one request per click, redirect, pending/paid/canceled/error copy.

```bash
git add packages/web/src/api/payments.ts packages/web/src/screens/InventoryScreen.tsx packages/web/src/screens/InventoryScreen.test.tsx
git commit -m "feat: connect Bank to YooKassa payments"
```

### Task 6: Add the public prices route

**Files:**
- Create: `packages/web/src/screens/PricesScreen.tsx`
- Create: `packages/web/src/screens/PricesScreen.test.tsx`
- Modify: `packages/web/src/app/App.tsx`
- Modify: `packages/web/src/app/design-system.css`

**Interfaces:**
- Consumes: `fetchCoinPackages()`.
- Produces: unauthenticated route `/prices`.

- [ ] **Step 1: Write failing route and content tests**

```ts
expect(screen.getByRole('heading', { name: 'Пакеты монет' })).toBeInTheDocument();
expect(screen.queryByRole('button')).not.toBeInTheDocument();
expect(screen.queryByText(/войти|регистрац|купить/i)).not.toBeInTheDocument();
```

- [ ] **Step 2: Run tests and confirm `/prices` is missing**

Run: `pnpm --filter @hockey/web test -- src/screens/PricesScreen.test.tsx src/app/App.test.tsx`
Expected: FAIL with no public route.

- [ ] **Step 3: Implement a responsive public-only catalog screen outside `PrivateRoute`**

Render loading, retryable error, empty, and populated states. Reuse Bank formatting and visual tokens but include no interactive payment/auth elements.

- [ ] **Step 4: Run tests and commit**

Run: `pnpm --filter @hockey/web test -- src/screens/PricesScreen.test.tsx src/app/App.test.tsx`
Expected: PASS when logged out, including direct navigation and absence of forbidden controls.

```bash
git add packages/web/src/screens/PricesScreen.tsx packages/web/src/screens/PricesScreen.test.tsx packages/web/src/app/App.tsx packages/web/src/app/design-system.css
git commit -m "feat: add public coin prices page"
```

### Task 7: Add package management and payment snapshots to admin

**Files:**
- Modify: `packages/server/src/admin/routes.ts`
- Modify: `packages/server/test/admin.test.ts`
- Modify: `packages/web/src/admin/api.ts`
- Modify: `packages/web/src/admin/AdminScreen.tsx`
- Modify: `packages/web/src/admin/AdminScreen.test.tsx`

**Interfaces:**
- Produces: `GET /admin/coin-packages`, `POST /admin/coin-packages`, `PATCH /admin/coin-packages/:id`.
- Extends: `AdminPayment` with `coinAmount`, local ID, provider ID, created/paid timestamps.

- [ ] **Step 1: Write failing admin authorization, validation, CRUD, and rendering tests**

```ts
expect(await screen.findByText('Пакеты монет')).toBeInTheDocument();
expect(screen.getByDisplayValue('Игровой запас')).toBeInTheDocument();
expect(screen.getByLabelText('Маркер')).toHaveValue('hit');
```

- [ ] **Step 2: Run focused admin tests and confirm endpoints/tab are absent**

Run: `pnpm --filter @hockey/server test -- test/admin.test.ts -t "coin packages|payments"`
Expected: FAIL for missing package endpoints.

Run: `pnpm --filter @hockey/web test -- src/admin/AdminScreen.test.tsx -t "coin packages|payments"`
Expected: FAIL for missing navigation/editor.

- [ ] **Step 3: Implement validated admin endpoints and audit events**

Use Zod: trimmed non-empty title/slug, positive integer `coinAmount`/`priceRub`, optional trimmed badge, marker enum, integer order, boolean active. Append catalog create/update events through the existing admin event log.

- [ ] **Step 4: Implement the admin package list/editor and richer payment cards**

Use existing glass form controls. Text buttons remain icon-free; standalone controls use `.icon-btn`. Invalidate public/admin package query keys after save.

- [ ] **Step 5: Run focused admin suites and commit**

Run: `pnpm --filter @hockey/server test -- test/admin.test.ts -t "coin packages|payments"`
Run: `pnpm --filter @hockey/web test -- src/admin/AdminScreen.test.tsx -t "coin packages|payments"`
Expected: PASS for non-admin denial, CRUD, validation, deactivation, current display order, and payment snapshot fields.

```bash
git add packages/server/src/admin/routes.ts packages/server/test/admin.test.ts packages/web/src/admin/api.ts packages/web/src/admin/AdminScreen.tsx packages/web/src/admin/AdminScreen.test.tsx
git commit -m "feat: manage coin packages in admin"
```

### Task 8: Wire dev secrets and deployment configuration

**Files:**
- Modify: `docker-compose.staging.yml`
- Modify: `.github/workflows/deploy-dev.yml`
- Test: `.github/workflows/deploy-dev.yml` inspection plus server config tests

**Interfaces:**
- Consumes GitHub secrets: `STAGING_YOOKASSA_SHOP_ID`, `STAGING_YOOKASSA_SECRET_KEY`.
- Produces server env: `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`, `YOOKASSA_RETURN_URL=https://dev.hockey.inbotwetrust.ru/inventory?tab=bank&payment=return`.

- [ ] **Step 1: Add a failing static workflow assertion or focused config test for missing forwarding**

```ts
expect(workflow).toContain('STAGING_YOOKASSA_SECRET_KEY: ${{ secrets.STAGING_YOOKASSA_SECRET_KEY }}');
expect(compose).toContain('YOOKASSA_SECRET_KEY: ${STAGING_YOOKASSA_SECRET_KEY:-}');
```

- [ ] **Step 2: Forward test-shop variables only through the dev workflow/compose overlay**

Do not modify `.github/workflows/deploy.yml` or production compose environment. Add the YooKassa secret names to the dev workflow required-secret guard.

- [ ] **Step 3: Verify no secret value appears in tracked files**

Run: `git grep -n "test_" -- . ':!pnpm-lock.yaml'`
Expected: no YooKassa secret value.

- [ ] **Step 4: Commit deployment wiring**

```bash
git add docker-compose.staging.yml .github/workflows/deploy-dev.yml
git commit -m "chore: configure YooKassa test payments on dev"
```

### Task 9: Full verification, review, and dev acceptance

**Files:**
- Modify only files required by failures found in this task.

**Interfaces:**
- Consumes all prior tasks.
- Produces a verified branch ready for integration into `dev`.

- [ ] **Step 1: Run database and server verification**

Run: `pnpm --filter @hockey/game-core build`
Run: `pnpm --filter @hockey/server typecheck`
Run: `pnpm --filter @hockey/server lint`
Run: `pnpm --filter @hockey/server test`
Expected: all PASS with Postgres 16 and Redis 7 test services available.

- [ ] **Step 2: Run web verification**

Run: `pnpm --filter @hockey/web typecheck`
Run: `pnpm --filter @hockey/web lint`
Run: `pnpm --filter @hockey/web test`
Run: `pnpm --filter @hockey/web build`
Expected: all PASS.

- [ ] **Step 3: Inspect the complete branch diff for secrets and financial regressions**

Run: `git diff --check origin/dev...HEAD`
Run: `git grep -nE "YOOKASSA_SECRET_KEY=.*[^}]$|Authorization: Basic" -- ':!docs/superpowers/plans/*'`
Expected: clean diff; no literal credential; Authorization is constructed only inside the provider client.

- [ ] **Step 4: Integrate into `dev` and push only after review**

```bash
git push origin HEAD:dev
```

Expected: pushed commit is the exact reviewed HEAD. Do not force-push.

- [ ] **Step 5: Configure dev repository secrets**

After GitHub authentication is restored, set `STAGING_YOOKASSA_SHOP_ID=1463027` and the provided temporary test key using `gh secret set`; never place the key on a command line that is logged. Confirm names with `gh secret list` without reading values.

- [ ] **Step 6: Watch dev deployment and verify provenance**

Run: `gh run list --workflow deploy-dev.yml --branch dev --limit 3`
Run: `gh run watch <run-id> --exit-status`
Expected: image build, migration, recreate, and health smoke all green for the pushed SHA.

- [ ] **Step 7: Complete rendered and provider-backed dev acceptance**

Verify unauthenticated `https://dev.hockey.inbotwetrust.ru/prices`, authenticated Bank catalog parity, admin package edits, and payment visibility. Make one YooKassa test-card purchase and reconcile evidence: one provider `succeeded`, one local `paid`, one `currency_ledger` purchase credit, and the exact expected balance increase.

- [ ] **Step 8: Record limitations without claiming production readiness**

Report PASS/FAIL/BLOCKED separately for local tests, CI, dev deployment, rendered QA, and end-to-end test payment. State that production remains untouched and blocked on live credentials, fiscal receipts, and refund/chargeback policy.
