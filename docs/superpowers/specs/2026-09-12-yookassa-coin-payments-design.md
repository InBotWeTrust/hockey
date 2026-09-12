# YooKassa Coin Payments Design

## Scope

Add test YooKassa payments to the dev environment for authenticated purchases of coin packages. Production credentials and live payments are out of scope. Add a public, unauthenticated `/prices` page that only lists active packages and ruble prices; it has no login or purchase actions.

The same database catalog powers the in-app Bank, the public prices page, payment creation, and package administration. Existing payment administration is extended to show provider-backed operations.

## Product rules

- Only coin packages can be purchased with rubles in this release.
- Payment can start only inside the authenticated in-app Bank.
- `/prices` is informational only.
- Package title, description, coin amount, ruble price, marketing badge, marker, display order, and active state are editable by an administrator.
- Marker supports the existing visual labels, including `Хит`, `Топ`, and `Премиум`. The marketing badge remains free text, for example `Выгода 14%`.
- A package cannot be purchased when inactive, even if a client submits an old package ID.
- A created payment stores an immutable snapshot of package title, coin amount, and ruble price. Later catalog edits never change payment history or the purchased amount.
- The server, not the browser or return URL, decides whether coins are credited.

## Catalog

Create `coin_packages` with:

- stable UUID and unique slug;
- `title`, `description`;
- positive `coin_amount`;
- positive integer `price_rub`;
- optional `badge_text`;
- optional `marker` constrained to `hit`, `top`, or `premium`;
- `sort_order`, `is_active`;
- timestamps.

The migration seeds the seven packages currently shown by the Bank on `origin/dev`, preserving their names, amounts, prices, badges, markers, and order. No package is inferred from `admin_inventory_items`; inventory goods and coin packages remain separate commercial entities.

Public `GET /api/bank/packages` returns active packages only, ordered by `sort_order` and then unique `slug` as a deterministic tie-breaker. Equal display orders are allowed. Both the Bank and `/prices` consume this endpoint. Admin endpoints list all packages and allow create/update operations. Deactivation is preferred to deletion so payment history keeps a durable foreign-key target.

## Payment flow

1. An authenticated player selects an active package in the Bank.
2. `POST /api/bank/payments` accepts only `packageId` and a client-generated UUID `attemptId`. The server loads the current package and snapshots its commercial terms; client-supplied prices or coin amounts are rejected.
3. The server creates a local `pending` payment and calls YooKassa with the exact ruble amount, `RUB`, a redirect confirmation, a dev return URL back to the Bank, and metadata containing only the local payment ID. YooKassa receives a unique idempotency key derived from the local payment attempt.
4. The API returns the YooKassa confirmation URL. The web app navigates to that URL.
5. Returning to the app shows a pending state and refreshes payment/balance data. Return navigation never credits coins.
6. YooKassa sends a webhook. The server re-reads the payment through the authenticated YooKassa API and verifies provider ID, status, amount, currency, and local payment metadata instead of trusting the webhook body alone.
7. For `succeeded`, one database transaction locks the local payment, changes it from `pending` to `paid`, credits the snapshotted coin amount to `user_currency_account`, and appends one immutable `currency_ledger` entry referencing the local and provider payment IDs.
8. Duplicate or reordered webhooks become no-ops after reconciliation. The unique provider-payment index and a unique ledger reference prevent double credit.

Before sending the first request, the client persists a purchase-attempt identifier scoped to the authenticated owner and package. Double taps, ambiguous errors, network retries, and reloads reuse the same local attempt rather than opening multiple YooKassa payments. Storage failure blocks creation. The identifier is not expired or replaced locally: only a reliable terminal server status permits a later deliberate purchase to create a new attempt. An unattached server attempt older than 23 hours requires support reconciliation rather than reuse beyond YooKassa's idempotency window.

Creation and settlement both require the existing available balance plus reserved balance plus the purchased coins to fit the int32 account limit. Settlement rechecks this under account locks and rolls back without credit or terminal status if headroom has been consumed since creation.

## Failure, cancellation, and refunds

- All provider creation errors leave the persisted local attempt `pending` and return a safe Russian error message. This dev implementation does not distinguish a proven provider refusal from an ambiguous response loss; retries retain the same idempotency identity, and terminal state requires reconciliation. It must never assume that an error proves no payment was created.
- YooKassa cancellation changes a still-pending payment to `canceled`; it never changes balances.
- Unknown package, inactive package, amount mismatch, currency mismatch, metadata mismatch, or provider lookup failure never credits coins and is logged for investigation.
- Automated refunds and coin clawback are not enabled in this dev-test release. Refunded provider state may be displayed after reconciliation, but a production release requires an explicit policy for coins already spent, partial refunds, fiscal receipts, and support operations.

## Security and configuration

- `YOOKASSA_SHOP_ID` and `YOOKASSA_SECRET_KEY` exist only in server-side environment secrets.
- Dev uses the test shop. Production configuration is untouched.
- The secret is never returned through an API, embedded in Vite, logged, committed, or stored in payment metadata.
- Public package data contains no user or payment information.
- Payment creation requires normal user authentication. Admin catalog and payment endpoints retain existing admin authorization.
- Webhook processing is public at the HTTP layer because YooKassa calls it, but every event is verified against YooKassa's authenticated payment API before a financial mutation.
- Logs contain local/provider IDs and state transitions, not credentials or full provider payloads.

## Administration

The existing `Платежи` screen continues to provide revenue cards, search, status and amount filters, and sorting. YooKassa rows show player, snapshotted package title, amount, local payment ID, provider payment ID, status, creation time, and paid time.

Add `Пакеты монет` to the admin navigation. Administrators can:

- create a package;
- edit title, description, coin amount, ruble price, badge, marker, and display order;
- activate or deactivate a package;
- inspect saved badge and marker labels in the package list. A separate live preview before save/publish is an accepted dev limitation, not included in this release.

Validation rejects empty titles, non-positive amounts/prices, invalid markers, and conflicting slugs. Display orders may repeat and use the deterministic slug tie-breaker. Updates do not mutate historical payment snapshots.

## Web experience

- The Bank keeps its current card presentation but loads packages from the server.
- Pressing the ruble purchase action disables that package action while creation is in flight and then redirects to YooKassa.
- On return, the Bank communicates `Платёж обрабатывается`, `Монеты начислены`, `Платёж отменён`, or a recoverable error based on server state.
- `/prices` is a responsive standalone public route outside the auth guard. It lists the package name, description, coin amount, badge/marker, and ruble price. It contains no purchase, login, or registration controls.

## Data compatibility

Extend the existing `payments` table rather than introducing a parallel history:

- nullable `coin_package_id` foreign key;
- snapshotted `coin_amount` and existing `title`/`amount_rub`;
- provider identifiers and statuses;
- purchase-attempt/idempotency identity;
- timestamps needed for reconciliation.

Existing manual or inventory-linked payment rows remain valid. Admin analytics continue to count `paid` rows consistently.

## Verification

Automated coverage includes:

- migration/catalog seed and constraints;
- public active-package listing;
- admin CRUD and authorization;
- authenticated creation with server-side price lookup;
- inactive/stale package rejection;
- YooKassa request shape and idempotency;
- succeeded, canceled, duplicate, reordered, mismatched, and provider-unavailable webhook cases;
- exactly-once balance and ledger mutation under concurrent webhook delivery;
- Bank catalog rendering and redirect behavior;
- unauthenticated `/prices` access and absence of payment/login controls;
- payment and package visibility in the admin UI.

Before dev acceptance: run typecheck, lint, focused tests, full relevant package tests, and builds; deploy through `.github/workflows/deploy-dev.yml`; confirm migration and runtime SHA; then complete one YooKassa test-card payment and verify the provider state, one local paid row, one ledger credit, the updated balance, admin visibility, and public `/prices` rendering.

## Release boundary

This work may be deployed only to dev with test-shop credentials. It is not production-ready merely because a test payment succeeds. Production requires separate live credentials, receipt/fiscalization decisions, refund and chargeback policy, legal/support text as required by the merchant account, a clean `dev` to `main` release review, and explicit production authorization.
