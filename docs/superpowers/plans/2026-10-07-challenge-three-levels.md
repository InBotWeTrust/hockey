# Three Challenge Levels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. Native execution in this session; no delegation without user approval.

**Goal:** Add three cumulative levels to Beach, Ski Resort and Cyberpunk Yard, with level-aware progress and first-clear rewards.

**Architecture:** Keep location IDs and location sequence. Store per-level completion alongside existing location completion; freeze level rules and rewards in each new attempt. Explicit environment flags gate bundled location mechanics while absent flags retain legacy behavior.

**Tech Stack:** TypeScript, deterministic game-core, Fastify/Zod, PostgreSQL, React/Pixi, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-07-challenge-three-levels-design.md`

## Global Constraints

- Local implementation only; no dev deployment in this task.
- Three levels only for Beach, Ski Resort and Cyberpunk Yard. Preserve all other modes and production access restrictions.
- Level 1 unlocks next location and level 2; level 2 unlocks level 3.
- Stars and experience multiply by 1, 2, 3; coins retain the base value. No repeat or retroactive reward credit.
- Old completed locations receive all three completion credits; old active attempts preserve immutable rules and rewards.
- Keep objectives, shot limits, match duration, event density and artwork unchanged.
- Follow scoped AGENTS; build game-core before consumer checks. Use dedicated test DB/Redis only.
- Branch `feature/challenge-three-levels`; base `89ba0e94ea3cf4106695e52140ae6a23cd51134b`.

## Review Focus

- An old active attempt resumed after migration uses its old validation contract and reward.
- Duplicate/concurrent finish requests cannot grant a second level reward.
- A forged level or disabled interaction is rejected server-side despite client state.
- Changing selection with an active attempt resumes that attempt rather than replacing it.
- Ski level 1 retains slope physics but has neither slips nor fatigue; slip poses remain on level 2.

---

### Task 1: Deterministic level rules

**Files:** Create `packages/server/src/bonusGames/challengeLevels.ts` and `packages/server/test/bonusGames/challengeLevels.test.ts`; modify `packages/game-core/src/{skiEnvironment,cyberpunkEnvironment,bonusChallenge,index,version}.ts`, corresponding environment tests, `packages/game-core/test/version.test.ts`, and `packages/server/src/bonusGames/types.ts`.

**Interfaces:** Export `ChallengeLevel = 1 | 2 | 3`, `supportsChallengeLevels(slug: string): boolean`, and `buildChallengeLevelEnvironment(slug: string, level: ChallengeLevel, environment: BonusChallengeEnvironmentRules): BonusChallengeEnvironmentRules` from the server helper. Add optional `slipsEnabled` and `fatigueEnabled` to Ski rules and `outagesEnabled` to Cyberpunk rules. Absent flags retain legacy behavior.

- [ ] Add matrix tests for all nine combinations: Beach wind always, puddles at 2+, fatigue/stumbles at 3; Ski slope always, slips at 2+, fatigue at 3; Cyberpunk magnets always, outages at 2+, fatigue/stumbles at 3. Assert inputs are not mutated.
- [ ] Add core regressions for absent flags preserving old seeded events/motion, disabled events producing no effects, Ski slope with disabled fatigue, level-2 slip poses, and deterministic repeated sampling. Run targeted tests and observe RED.
- [ ] Implement explicit gates in samplers/schedulers and server Zod parsing. Do not remove whole environments when they carry base movement. Preserve shot-time slip blocking.
- [ ] Bump game-core version and preserve supported legacy snapshot dispatch; add compatibility assertions for active legacy attempts.
- [ ] Run core suite, build core, and run server helper tests. Review diff and commit `feat: add cumulative challenge level rules`.

### Task 2: Level-aware storage and reward idempotency

**Files:** Create `packages/server/db/migrations/187_challenge_levels.sql` (verify number remains free) and `packages/server/test/bonusGames/challengeLevelMigration.test.ts`; modify `packages/server/src/bonusGames/{types,economy}.ts`, `packages/server/test/bonusGames/economy.test.ts`.

**Interfaces:** Add nullable `challenge_level` to attempts and economy events, constrained to 1..3. Null means legacy or untiered. Add `user_bonus_game_level_completion(user_id, bonus_game_id, level, attempt_id, reward_snapshot, completed_at, source)` with uniqueness on user/location/level; source distinguishes first-clear from legacy credit. Extend `FirstClearRewardInput` with `challengeLevel: ChallengeLevel | null`.

- [ ] Write migration tests: old completions gain levels 1..3 only for the three supported slugs; balances and ledger stay unchanged; old snapshots and unrelated completion rows are unchanged; replay/backfill cannot duplicate credits. Observe RED using isolated services.
- [ ] Write economy tests for rewards at levels 1/2/3, repeat/concurrent completion, and legacy completion after migration. Observe RED.
- [ ] Implement additive migration and replace first-clear economy uniqueness with level-aware uniqueness while retaining legacy uniqueness. New completion acquires level credit before balances change, within existing transaction/locks. Level 1 also records location completion; legacy successful attempts receive three credits without additional payouts.
- [ ] Preserve ledger/career observation keys and rewards for untiered games. Multiply only stars and experience when creating reward snapshots, never when finishing an old attempt.
- [ ] Run migration/economy regressions and commit `feat: persist challenge level progress and rewards`.

### Task 3: Server catalog, start and interaction contract

**Files:** Modify `packages/server/src/bonusGames/{catalog,service,routes,types}.ts`; test `packages/server/test/bonusGames/{catalog,attempts,routes,serviceDto,beachInteractions,cyberpunkInteractions,skiInteractions}.test.ts`.

**Interfaces:** Catalog adds `levels: ChallengeLevelDto[] | null`, where each entry has `level`, `is_unlocked`, `is_completed`, and `reward`. Start body accepts optional `level`; supported new attempts default to 1. Attempt DTO adds `challenge_level: ChallengeLevel | null`; new tiered snapshots add `challengeLevel`. Existing location completion DTO remains compatible.

- [ ] Add tests: level-1 completion opens next location and level 2, level-2 opens level 3, unopened levels return a readable lock error, unsupported locations reject an explicit level, values outside 1..3 are invalid. Observe RED.
- [ ] Add tests for legacy active resume with omitted/selected level, another active attempt preservation, immutable snapshot rewards, server-side rejection of disabled cleanup/panel effects, and unchanged other-mode start behavior. Observe RED.
- [ ] Implement catalog level projection and level checks under the existing start transaction. Freeze derived level rules and base reward multipliers at start. Return the active attempt without rewriting or consuming another attempt quota. Preserve current quota policy.
- [ ] Wire finish to Task 2 reward contract. Use level-1 location completion for existing predecessor sequence. Add Russian API messages for level locks/invalid selection.
- [ ] Build core; run targeted server regressions sequentially against dedicated test services, checking no skips. Run server typecheck; commit `feat: expose and validate challenge levels`.

### Task 4: Level selection and level-specific preview

**Files:** Modify `packages/web/src/api/{bonusGames,apiFetch}.ts`, `packages/web/src/screens/BonusGamesScreen.tsx`, scoped styles in `packages/web/src/app/design-system.css`, their tests, and relevant environment renderers discovered via imports in the real BonusGamesScreen flow.

**Interfaces:** Web DTOs mirror Task 3. `startBonusAttempt(gameId, options)` accepts selected level through the existing request-options contract without dropping AbortSignal. Preview owns selected level; start sends that level, while resume uses the attempt's level.

- [ ] Add UI tests for three selectors, locked/completed states, cumulative descriptions, reward x1/x2/x3, level-1 next-location progress, and unchanged untiered previews. Observe RED.
- [ ] Add tests for stale-lock response refresh, duplicate start taps, and active attempt resume preserving its actual level. Observe RED.
- [ ] Implement selectors inside the existing location modal, reuse header/close/artwork and show Russian unlock explanations. Keep main location cards and add compact level progress.
- [ ] Gate visuals and interactions from snapshot flags: no fatigue badges at levels 1/2, no level-1 puddles/slips, no Cyberpunk level-1 darkness. Retain Ski level-2 slip poses and enabled breakers. Rendered client must match server rules.
- [ ] Run direct targeted web Vitest and web typecheck, review diff and commit `feat: add challenge difficulty selection`.

### Task 5: End-to-end local acceptance

**Files:** Add focused regressions to affected tests from Tasks 1–4; update this plan's checkboxes and verification notes.

- [ ] Read testing/local-development/game-state guidance. Confirm dedicated test service isolation without printing connection secrets.
- [ ] Run game-core suite/build, affected server bonus suites, affected web tests, typecheck, lint and build. Distinguish baseline failures with evidence; skips are not success.
- [ ] Browser-check real local catalog and preview at small mobile width. Check all nine level combinations, locked level, active legacy resume, and a first-clear sequence/reward using existing authorized local fixtures; do not create or alter an account without approval.
- [ ] Review whole diff for progression, economy concurrency, immutable snapshots, disabled effect paths, migration reruns, UI request races and production access guard preservation. Do not dispatch agents without approval.
- [ ] Report implemented behavior, observed checks and any browser/integration gaps. Provide local preview and branch/commit. No push/merge/deploy until release is requested.
