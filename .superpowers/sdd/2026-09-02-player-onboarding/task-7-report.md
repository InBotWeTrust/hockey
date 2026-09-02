# Task 7 implementation report

Implementation commit: `9108a55` (`feat(web): gate the app with required onboarding`)

## Delivered

- Added a typed public onboarding client for required/start/view/complete and the canonical `['onboarding', 'required']` query-key helper.
- Added an authenticated `OnboardingGate` that blocks all routed application content and app chrome until the server reports no required chain.
- Kept login, demo, and VK callback entry points outside the authenticated gate.
- Added one lifecycle client session UUID, reused across Strict Mode start attempts; `refreshAfterGameExit()` performs the only post-game recheck and creates a fresh UUID before starting a newly required run.
- Added the informational flow with in-memory-only position, `N из M` progress, Back after the first step, image fallback, best-effort once-per-step view recording, and server-confirmed blocking completion with retry.
- Added safe-area/reduced-motion styling using existing design tokens and text-only button primitives. No modal, close, or skip affordance was introduced.
- Left the `tutorial_shot` rendering as a non-bypassable disabled placeholder for Task 8; no tutorial gameplay or admin preview behavior is included here.

## TDD evidence

RED, before production modules:

```text
pnpm --filter @hockey/web exec vitest run \
  src/onboarding/OnboardingGate.test.tsx \
  src/onboarding/OnboardingFlow.test.tsx \
  src/app/App.test.tsx

Test Files 3 failed (3)
Cause: Failed to resolve ../api/onboarding.js (production API/Gate/Flow absent)
```

GREEN:

```text
Test Files 3 passed (3)
Tests 15 passed (15)
```

The focused tests cover loading and pass-through, required/start, API retry, Strict Mode session idempotency, direct URL and browser Back containment, hidden navigation/realtime/toasts/update prompt, progress and Back behavior, view de-duplication, image fallback, and blocking/retryable completion.

## Verification

- Focused App/onboarding suites: PASS, 3 files / 15 tests.
- Full web runner: PASS, 74 non-Daily files / 541 tests plus all 65 isolated `DailyScreen` scenarios.
- `pnpm --filter @hockey/web typecheck`: PASS.
- `pnpm --filter @hockey/web build`: PASS (2,678 modules transformed).
- `pnpm lint`: PASS.
- Scoped `prettier --check`: PASS.
- `git diff --check`: PASS before commit.

## Changed files

- `packages/web/src/api/onboarding.ts`
- `packages/web/src/onboarding/OnboardingGate.tsx`
- `packages/web/src/onboarding/OnboardingFlow.tsx`
- `packages/web/src/onboarding/onboarding.css`
- `packages/web/src/onboarding/OnboardingGate.test.tsx`
- `packages/web/src/onboarding/OnboardingFlow.test.tsx`
- `packages/web/src/app/App.tsx`
- `packages/web/src/app/App.test.tsx`

## Self-review and concerns

- The gate waits for a fresh required response after each mount even if React Query has cached data, preventing a previous authenticated lifecycle from leaking a stale decision.
- Normal `/me` changes do not affect the gate and there is no polling or focus refetch.
- Public entry routes are deliberately bypassed before the gate; every other authenticated direct route remains hidden as gate children.
- A failed best-effort view is not surfaced immediately. If the server later rejects completion because evidence is absent, the completion error remains blocking and the player can reload to restart from step one, as required by the product contract.
- Tutorial functionality and game-exit call-site wiring remain intentionally deferred to Tasks 8 and 9.
