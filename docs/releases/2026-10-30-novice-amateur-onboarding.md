# Novice start: amateur onboarding release notes

## Implemented in this stage

- Both required stories load the current qualification threshold from the profile. A failed profile request shows retry instead of silently displaying the old 300-goal fallback.
- Profile responses expose `amateurTransitionStatus`: `qualifying`, `onboarding_pending`, or `complete`. Eligibility now uses daily-only qualification and the preserved-access marker described below.
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

One-time yard highlight; two achievements and grouped map notification; contextual push; novice NPC/AI spoiler restrictions; funnel events. Grigory mini-games remain P2. The first-stage course access and novice recovery changes are already in the branch, but the course's server/client activation flags still need release-time coordination.

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


## Daily qualification and map stage

Migration 246 adds `users.daily_goals_total` and `amateur_access_preserved`. The backfill combines archived daily-period goals with goal shots from periods that have no archive; archived shots are never counted twice. Already eligible players retain access without fabricated qualification goals. Lifetime career statistics are unchanged.

A database INSERT trigger credits each confirmed daily goal in the shot transaction, including during a rolling deployment with the previous server. Saves, misses and other modes do not contribute; transaction rollback also rolls back the credit. Period closure does not credit goals again. The migration locks source tables during backfill; schedule its deployment as a data migration, never as a manual live UPDATE. Only retained archives/shots can reconstruct historical daily progress.

Profile, onboarding, amateur guards/opponent discovery, referral qualification and admin/public level displays now share daily qualification semantics. The amateur-ticket achievement uses the same daily goal source. Profile and daily-state APIs expose the new count; new clients prefer it while retaining fallback compatibility with older API responses.

The approved map plaque sits above the lower navigation, opens `/daily` without promising an immediate start, and remains until amateur onboarding completion. The threshold is configurable; production's audited value was 100. It does not navigate automatically or display a shooting-time popup.

Validation for this stage:
- Core server regression: 251 tests passed (218 amateur, 28 daily, 4 referral, 1 migration); the referral suite was subsequently extended to verify exclusion of other-mode goals.
- Admin/daily-achievement/migration/profile-field regression: 50 tests passed.
- Additional profile, access, onboarding and venue suites passed; fixtures that intentionally model qualification now seed the daily counter instead of the mixed lifetime counter.
- Client: 77 access/map/Sections tests and all 333 DailyScreen tests passed.
- Typecheck, lint, build and diff check passed. The earlier full-root game-core failures listed above remain unresolved; this stage does not modify game-core.
- Playwright checked a temporary standalone map fixture at 390x844 and 320x568, including collapsed navigation and the `/daily` navigation callback. The narrow plaque stayed within the viewport with an 8px gap above the menu. This is component visual acceptance, not an authenticated/device or deployed-runtime test. The only browser error was the fixture's missing favicon. Temporary fixture files were removed.
- No merge, deployment, production settings or production data changes were performed.


## Period results and course invitation stage

Closing fresh period/day results now applies the deferred server state and stays on the rink. The latest period is marked read before applying state, so the same summary does not reopen immediately. Onboarding refresh remains tied to voluntary exit. Results retain actual shots, goals, accuracy and duration; supplemental content uses a frozen server snapshot for qualification and the next-break deadline.

Migration 247 adds a per-user invitation-offered timestamp. The authenticated `POST /duel/training/course/invitation` endpoint serializes with gameplay, checks course enablement/completion and gameplay locks, then atomically offers the next available exercise at most once. It only offers during a current local-day break following quota/timeout closure, while the standard break timer is still running, and excludes existing amateurs. An offer receipt is not an acknowledgement that pixels reached the player. The client makes this optional request only in novice break results when exercises are enabled; failure leaves the results usable. The exercise button is voluntary and links directly to the offered course exercise.

The result card scrolls within the viewport on small screens. In the local Playwright fixture at 320x568 the initial card overflowed (top -46px); after the fix it fits between y=20 and y=548 and scrolls internally. A 390x844 fixture also showed the actual five-shot timeout example (2 goals, 40% accuracy), qualification 42/100 and the optional invitation. These fixtures use local demonstration data, not authenticated gameplay.

Validation: 48 server tests and 410 client tests passed; typecheck, lint, build and diff check passed. The no-return-to-map and qualification-summary regressions were observed failing before fixes, as were the new invitation endpoint tests. Previously reported full-root game-core failures remain outside this stage. The agreed map polish is included: target icon, separate left/right numbers and the shared `--blue-accent` fill from duel limits.

Activation still requires a reviewed release and both exercise flags. No environment has been deployed or activated.

## Novice achievements and grouped map notice

Migration 248 adds two manual-claim catalogue entries: `first-period` (2 stars / 2 experience) and `hockey-school` (10 / 10). The production catalogue was checked with read-only SQL on 2026-10-30: existing `first-daily-game` and `first-training` have different conditions; neither proposed achievement was present. Existing artwork is reused from those catalogue families.

Transactional INSERT triggers complete the first achievement only for period 1 archived as `quota` or `timeout`, and the second only after all seven named initial-course exercises have completion records. A day-end interruption does not qualify. Completion does not credit balances: existing claim transactions and their duplicate-claim protection remain the sole reward path. Per-exercise rewards remain unchanged.

The user approved historical eligibility. Migration 249 backfills retained first-period archives and seven-exercise completions, using `ON CONFLICT DO NOTHING`; existing claims and balances are preserved. Missing historical records cannot be reconstructed. Newly backfilled achievements enter the same notification inbox as new gameplay completions.

The inbox in migration 248 records ordinary and tiered completion events once per achievement/stage. Pre-existing unrelated achievements are not copied into it. Authenticated GET `/achievements/notifications` is read-only; POST `/achievements/notifications/seen` acknowledges only the supplied IDs belonging to the caller. Acknowledgement neither claims rewards nor clears newer events. A per-user timestamp makes the tasks hint one-time.

`AchievementMapNotice` is mounted only on the map and waits for existing reward/failure overlays to clear. It groups the pending batch into one nonblocking notice, links to `/achievements?filter=claimable`, and highlights the tasks icon/building. It acknowledges after visible rendering, never while the tab is hidden. If acknowledgement fails, the inbox permits retry on the next map visit; delivery is not claimed to be exactly once across concurrent devices or network failures. Unclaimed rewards keep their existing red counter. The claimable filter now survives initial catalogue loading.

Result-card polish from user review is included: target icon, separate left/right progress numbers with stronger contrast, shared blue progress fill, monospace countdown, equally sized buttons, explicit stay-on-ice action, and a fuller course invitation.

Validation: 60 distinct server tests passed across novice rewards/backfill/inbox, claim, daily evaluator, catalogue, course routes and summary counters. 434 distinct client tests passed across the notice, achievements, map, sections, result supplement and daily screen. New reward/backfill/notice scenarios and the deep-link loading regression were observed failing before implementation/fix. Typecheck, lint and build passed (existing build warnings remain). Playwright checked the local notification fixture at 390x844 and 320x568; at 320px its horizontal bounds were 22.1–297.9px. Fixtures use local data without account creation or authenticated gameplay. Local preview files remain untracked for user review.

Remaining P1 work: contextual voluntary push, novice bar character visibility and server-side spoiler filtering, funnel events, optional first yard hint, authenticated/mobile acceptance and an explicitly authorized release. Exercises and amateur story publication remain release-time activation steps. No deployment or production mutation was performed.
