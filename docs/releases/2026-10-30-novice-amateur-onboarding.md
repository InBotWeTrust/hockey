# Novice start: amateur onboarding release notes


## Current review status (2026-10-31)

Development and local verification only. Draft PR #489 targets `dev`; no merge, deployment, staging data edit or production mutation is authorized in this stage. Floating games/chat controls remain unchanged by explicit user request and require a separate UX decision.

Implemented since the earlier checkpoints: novice bar visibility and AI context filtering; empty furniture at hidden NPC positions; prospective funnel instrumentation; persisted optional 13-location city introduction, first-click disclosure and repeat-click entry, resume at the first unseen location after play, and the reviewed map/result/achievement feedback.

Legacy inaccessible NPC games now finish technically through the existing transactional settlement path: return the original stake, release the visitor admission, retain the match and ledger, and do not grant a win. Paused legacy games are included. Unreachable local Maria card leases release their admission before a new available game is admitted. Human games and accessible NPC games retain their ordinary lifecycle. This is source code for the future authorized deployment, not a live cancellation.

The joined API journey covers beginner onboarding, first daily period and its timeout, manual first-period reward, optional course invitation, school reward, the daily-goal 99/100 boundary, amateur onboarding, and exactly three starter inventory instances. Exercise completion and the final confirmed goal use explicit isolated DB fixtures; separate course/daily suites validate gameplay submissions. This is not an authenticated browser or physical-device end-to-end claim.

The journey exposed a real lock-order race between background stage initialization and immediate reward claim. A two-transaction PostgreSQL test reproduced the deadlock before the fix; stage initialization now takes the user lock before stage rows, matching the claim path. Claims, history and reward values are unchanged.

All 90 authored/recorded observation and curated shooting scenes reproduce their existing answers/windows under core 117. Only stale bank version metadata was refreshed; scene seeds, timing and deterministic shot behavior were not changed. Historical migration tests now stop at their intended schema version; tournament fixtures use daily qualification; profile/onboarding fixtures load the current API data they actually require.

Local acceptance includes city cards/navigation at 320×568 and result layouts at 320×568 (light) and 390×844 (dark), including scrolling to both result actions. The narrow statistics grid retains readable labels. Previously existing players keep direct entry; only actual displayed card selections advance the city-tour viewed count. If browser storage is unavailable, server saves continue through the in-memory queue while the page is open. Physical iOS/PWA and Android permission/delivery checks, real Telegram authentication, and a full authenticated device playthrough remain manual acceptance gaps. They are not replaced by the fixture previews.

Local release checks (2026-10-31):
- Full game-core: 607 passed, 77 files.
- Full server on the dedicated local database/Redis: 2667 passed, 51 skipped, 317 files (308 passed / 9 skipped). Command uses `vitest run --hookTimeout=60000` for local migration setup; gameplay assertion timeouts are unchanged. The default 10-second hook budget timed out on a cold run while other checks competed for resources.
- Full web: 3765 passed across 422 files, including the isolated DailyScreen and other heavy suites.
- Root typecheck, lint and builds passed. Final server/web package builds passed, as did the initial-load budget audit and its Node test. Existing chunk-size and Browserslist warnings remain. These are local results; no CI or deployed-runtime success is claimed.
- Newly reproduced issues covered by failing-then-passing checks: hidden paused-game admission, one-time legacy stake/visitor refund, stale local-card lease, unavailable browser storage, unchanged legacy-player navigation, premature viewed-location accounting, and background-achievement / reward-claim lock ordering.

Temporary `novice-*-preview.*`, `novice-toast-themes.html` and the local QA frame remain outside the PR. The test database and Redis are dedicated local instances, not dev/prod.

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

## Earlier remaining-work checkpoint (superseded by current status)

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

## Contextual voluntary push and final UI polish

The first-period result offers a reminder beside the break timer, only to novices during an active break. The course remains the primary CTA. Browser permission is requested only from the explicit enable action. Telegram Mini Apps and unsupported environments do not receive an unusable permission button. On iPhone/iPad outside standalone mode the proposal explains adding the PWA to the Home Screen. Existing granted/denied permission suppresses a fresh proposal; Android OS permission is now exposed separately from registration status for this decision. Profile settings retain their existing connection flow and show actionable denied-permission copy.

The user selected a seven-day repeat interval after “Не сейчас”. Migration 250 stores the snooze deadline and handled-permission receipt per user. Authenticated `/push/novice-prompt` GET reads eligibility; POST accepts only `snooze` or `handled`. A failed snooze save stays retryable. Successful explicit enable uses the existing subscription endpoint and opts into the existing daily-game notification category. Shared web subscription helpers were extracted from profile settings without introducing a second registration mechanism. No extra scheduler event is created.

A regression exposed queued break reminders being sent after the player resumed or closed the game. The delivery worker now checks the same day pool, period, current local day, break state and daily-game preference before sending `daily.break_finished`. It also retains the existing current-subscription lookup. Tests cover resumed/closed/idle games, removed subscriptions and muted daily-game reminders. A concurrent game action after the final eligibility read can still race with an already-started external delivery; no external-send transaction guarantee is claimed.

Reviewed UI refinements are included: qualification counters animate from the pre-period total after 200ms, finish over 700ms, and show a brief white glint. Reduced motion skips the effect. The map notice now uses the shared dark toast, a visible close icon and an en dash; it dismisses after five seconds on a visible tab. Theme comparison fixtures are local and untracked.

Validation: 29 distinct server tests and 378 distinct client tests passed across the changed push/UI paths, including observed RED for prompt persistence, voluntary permission, timeout hiding and stale delivery. No real browser permission was requested and no real push message was sent in validation. Physical iOS/PWA and Android delivery acceptance remains outstanding. The previously documented four game-core fixture failures remain unrelated; game-core is unchanged. No environment was deployed or activated.

Next stage: novice bar character restrictions and server-side AI spoiler context, followed by funnel events and release acceptance.


## Novice bar access and story filtering (local implementation)

The public layout removes Maria, Arsenich and Timofey slots, names and assets. The office entry is hidden; direct office/card routes check access before mounting private content. Igor, Grigory, Oleg, Veronika, Daria, human game tables and invitations remain available. Both panorama variants filter static game hotspots as well as character slots. Admin layout editing retains the full layout.

A production-registered server policy runs after authentication and rejects hidden-character conversations, memory/physical actions, computer starts, local Maria cards and saved NPC match reads/actions. New players reveal the full cast after completing the second onboarding. Migration 246's preserved amateur access also preserves the existing cast for legacy amateurs. Existing per-character admission and office rules continue to apply afterward.

Novice AI requests filter authored persona text, conversation history, memory and tool results; tool arguments containing unrevealed names cannot reach the underlying tool. Generated replies containing those names receive a neutral fallback. Response filtering also covers historical conversation snapshots and memory endpoints. This is a deterministic name filter plus prompt constraints, not proof against every indirect AI spoiler or player-authored chat.

Validation: access and AI regression cases were observed failing before implementation. Targeted server checks cover 66 distinct tests (access policy, provider, conversations, personas); targeted UI checks cover 54 tests (panorama, scene, map, office, route gate). Local typecheck/lint/build status is recorded in the implementation report. No authenticated browser acceptance, live model call, deployment or production mutation was performed.

Release caveat: existing novice matches against newly hidden NPCs are denied but not deleted or forcibly settled. A saved active match can still occupy the player's existing game admission until its normal expiry; inspect affected sessions before release and agree an explicit migration/settlement policy if needed. Do not silently cancel games or monetary stakes.

Remaining: funnel instrumentation, optional first yard hint, authenticated/mobile acceptance, release activation and explicitly authorized deployment. Local preview fixtures remain untracked.


## Funnel observations and first-yard hint (local implementation)

Migration 251 reuses `event_log` with type `novice_funnel`, scenario version `novice-start-v1`, server timestamps and an idempotency index. The player identifier is the existing internal UUID: pseudonymous, not an irreversible anonymization. No names, contact details, message bodies, device fingerprints or tokens are copied. The view `novice_funnel_events` exposes the normalized analytical fields. Collection is prospective: old facts are not relabeled as v1 observations.

Server triggers record natural onboarding completion (including its published version ID), daily first/second period starts, normal first-period/day completion, first exercise completions, achievement unlock/claim and qualification threshold crossing. Both the direct INSERT of the first active daily pool and later UPDATE starts are covered. Quota/timeout count as completion; day_end does not. Events commit or roll back with their source transaction. Preview/reset onboarding runs are excluded. Grigory minigame events remain unimplemented with the deferred P2 minigames.

The authenticated client endpoint accepts only allowlisted observations: first city view, course catalogue/direct exercise view, visible push prompt, permission outcomes, visible app activity and sessions. It rejects arbitrary fields and gameplay success events. Client observations are best-effort, marked as such, and deduplicated server-side; failed delivery does not block UI. The app session is a per-tab session renewed after 30 minutes without visible activity; visible foreground sampling occurs once a minute. These are observed sessions, not a cross-device identity/session reconstruction. Native permission results, snooze, installation guidance and failures are distinct outcomes.

The yard outline uses the existing blue hint treatment for eight seconds. Any location click dismisses it; other destinations remain usable. An atomic per-user receipt prevents repeated offers across tabs/devices. StrictMode shares the in-flight request. The receipt records an offer, not guaranteed pixels viewed if the application closes immediately. Existing task highlighting takes visual priority. Amateurs do not receive the hint.

Read-only report queries: `docs/analytics/novice-funnel.sql`. They use a natural-beginner-onboarding v1 cohort, UTC exact-day retention and mature denominators for D1/D3/D7 and 3/7/14-day promotion windows. Time/session averages and medians are explicitly conditional on observed converters. First-to-second-period return matches the same pool; goal comparisons normalize by shots. Client delivery loss can undercount observations. Qualification events track progress/level changes, not retroactive eligibility caused solely by an admin lowering the threshold.

Validation covers authenticated ownership, spoofed/unknown fields, replay, concurrent hint claims, transaction rollback, first INSERT and later period starts, timeout/day-end distinctions, promotion deduplication, StrictMode, dismissal/timeout and failed client delivery. Integration tests run against the isolated local test database. No production data, push delivery or deployment was changed. Physical-device and authenticated end-to-end acceptance, the old hidden-NPC match policy, and release activation remain pending.


## Optional city introduction (local, 2026-10-31)
- Replaces the rejected yard glow in CityMap with 13 location cards, synchronized map/dock navigation, a persistent direct /daily action, and explicit return to yard after completion.
- Migration 252 persists viewed IDs and first daily-period start independently; existing starts are backfilled. Automatic guidance stops after actual play starts, not merely after entering the yard.
- Interrupted introductions resume from a compact reminder. Settings exposes manual review. Failed writes stay queued locally and retry; gameplay remains available.
- Local fixture: /novice-yard-preview.html, isolated fixture state without authentication changes.
- Validation: server city-tour integration tests passed (2 tests with multi-step assertions); 54 focused web tests passed. Browser verified initial card, exploration and reload/resume. Full web suite has 11 failures across App onboarding, observation exercises, recorded playback and chat profile tests; not certified green. No deployment.

- Follow-up: after the first period, an interrupted introduction remains available through the small viewed-count action until all locations have been shown. It resumes at the first unseen location. A first click on an unseen building/dock circle opens its card; subsequent clicks enter through the existing route. Previously viewed locations retain direct entry.
