# Online Durak Implementation Plan

**Goal:** One-on-one Durak through search or direct invitation in Bar.
**Spec:** ../specs/2026-10-10-online-durak-design.md
**Architecture:** Shared pure rules; PostgreSQL authoritative queue, invitations and game snapshots; authenticated API; existing Durak table driven by a remote controller. A neutral opponent silhouette sits behind the table.
**Constraints:** No stakes, rewards or daily limits. Existing UI styles. Local work only. No auth changes. Preserve Maria.
**Review focus:** Concurrent matching/accept; hidden hands; stale/repeated actions; offline deadlines; navigation/reconnect.

- [x] Extract shared rules and verify Maria regression.
- [x] Add migration and transactional service, projection/deadline tests, auth API and timeout worker.
- [x] Add duel-style lobby, invitations/search and remote controller with reconnect/version checks.
- [x] Add silhouette and online result; verify small viewport and two-client contracts.
- [x] Run scoped tests/typecheck/build, independent review, record remaining gaps.

## Verification record

- Local Bar client tests: 57 passed (14 files), including Maria and online contracts.
- Dedicated synthetic PostgreSQL service/state tests: 6 passed; waiting-state regression observed RED then GREEN.
- Web/server typecheck and server build passed. Scoped ESLint and diff check passed.
- Browser visual fixture checked at 390x844 and 360x640: silhouette is behind the table with visible hands. This fixture is not a real two-user match.
- Independent review found overlapping waiting states; fixed and regression tested.
- Actual authenticated two-browser gameplay remains unverified. No push or deployment performed.
- An inadvertently expanded web test run failed: 10 tests and 2 unhandled errors across onboarding, observation and tournament suites. These failures were not classified as baseline or fixed as part of this task.

## Approved dev release extension

Single Bar entry opens the shared opponent lobby; Maria is selectable through the existing launch modal. Generated illustrated opponent replaces the SVG silhouette (WebP with alpha). User authorized dev release; production excluded.
