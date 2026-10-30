# Novice start: amateur onboarding release notes

## Implemented in this stage

- Both required stories load the current qualification threshold from the profile. A failed profile request shows retry instead of silently displaying the old 300-goal fallback.
- Profile responses expose `amateurTransitionStatus`: `qualifying`, `onboarding_pending`, or `complete`. Eligibility still uses the existing competition-level resolver; the daily-only qualification projection is a separate pending stage.
- Successful amateur onboarding completion grants one `rare` stick, one `rare` pair of skates, and one `rare` nutrition item, each with the catalog's full `charges_per_purchase` resource. No currency is charged and equipped items are not replaced.
- Migration 245 stores a permanent per-user receipt. Completion, receipt and all three inventory instances commit together. Concurrent retries and administrative story resets cannot grant a second set. If the catalog has missing, duplicate or empty medium-tier items, completion returns a retryable error without partial grants.
- Previously completed players receive an exclusion receipt during migration, not retroactive equipment. Existing onboarding flags remain unchanged.
- The client invalidates inventory caches after completion.

## Activation remains an explicit release step

No environment is activated by this source change. Do not run the dev-only seed against production or bypass its environment guard.

After an authorized dev deployment:

1. Confirm migration 245 applied and the runtime SHA matches the release.
2. Read the active inventory catalog: exactly one non-deleted `rare` item for each of `stick`, `skates`, `nutrition`, all with positive resources. Resolve catalog ambiguity before publishing.
3. Inspect the amateur chain through the existing admin onboarding API. Preserve any existing draft; do not overwrite it blindly.
4. Prepare/review the amateur story publication with its actual media objects using `/admin/onboarding/media` and `/admin/onboarding/chains/amateur/steps`. Informational steps require valid media objects. The current cinematic client renders the nine scenes in `packages/web/src/onboarding/amateurStory.ts`; verify their deployed assets as well as published media.
5. Preview the complete story, including the three medium-tier gifts. Publish the reviewed draft through `POST /admin/onboarding/chains/amateur/publish`; this sets the published pointer and enforcement together. Do not just toggle enforcement on a chain without a published version.
6. On an explicitly authorized test account, verify qualification, deferred entry after leaving gameplay, interrupted/retried story, completion and the three inventory items. Check an already-completed player is not forced through it again. Never reset a real player's state for testing without authorization.
7. Verify mobile rendering and the story-to-map handoff. Automated tests do not establish this acceptance.
8. Repeat the publication/data checks independently for production after separately authorized dev-to-main release. Watch GitHub Actions through migration, container recreation and health smoke.

## Remaining work from the novice-start plan

Daily-only qualification projection; map plaque and one-time yard highlight; on-ice period results and course invitation; two achievements and grouped map notification; contextual push; novice NPC/AI spoiler restrictions; funnel events. Grigory mini-games remain P2. The first-stage course access and novice recovery changes are already in the branch, but the course's server/client activation flags still need release-time coordination.

## Local validation

- 59 server tests passed across onboarding admin, lifecycle, applicability, seed content, amateur access and profile story fields.
- 105 client onboarding tests passed. New threshold, retry and inventory-cache regressions were observed failing before their fixes; the starter-set lifecycle test was also observed failing before implementation.
- Typecheck and lint passed. Build passed with existing chunk-size/Browserslist warnings.
- Full `pnpm test` stopped at game-core: 603 passed, 4 failed. `packages/game-core` is identical to `origin/dev`; this stage does not alter its deterministic behavior. Failing tests:
  - `openWindowObservation.test.ts`: `supplies an open and a closed paused scene`.
  - `openWindowObservation.test.ts`: `keeps recorded candidates tied to existing game recordings`.
  - `openWindowTrainingScenes.test.ts`: `reproduces a human-usable target window from first-period daily movement`.
  - `openWindowTrainingScenes.test.ts`: `rejects a declared window that hides a closed gap between two goals`.
  These report stale scene/core-version fixtures. The root run did not reach the full server/web suites; the scoped suites above were run separately.
- No browser/mobile acceptance, CI result or deployed-runtime verification is claimed for this stage.
