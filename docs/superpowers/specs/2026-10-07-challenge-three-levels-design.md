# Three challenge levels

## Approved product behavior

Introduce three cumulative difficulty levels for Beach, Ski Resort and Cyberpunk Yard. Keep each location's identity, objective, shot limit and match duration. Other locations and bonus modes retain their existing behavior.

| Location | Level 1 | Level 2 adds | Level 3 adds |
| --- | --- | --- | --- |
| Beach | Wind | Puddles and clearing taps | Fatigue, stumbles and rest |
| Ski Resort | Slope and uphill/downhill speed difference | Snow slips | Uphill fatigue and rest |
| Cyberpunk Yard | Magnetic strips and breaker interaction | Power outages | Fatigue, stumbles and rest |

Snow slip poses belong to the slip mechanic and remain enabled on Ski level 2. Existing visuals, event distributions and interactions remain applicable wherever their mechanic is enabled. Disable unrelated fatigue effects at levels 1 and 2; keep base movement and location physics.

## Progress and rewards

Level 1 follows the existing location unlock conditions. Completing it unlocks level 2 of that location and the next location. Completing level 2 unlocks level 3. Higher levels do not block the location sequence.

Stars and experience for first completion are the location's base reward multiplied by the level (1, 2 or 3). Do not change coin rewards without a separate product decision. Replays never grant another first-clear reward. Completion and reward credit must be atomic, retry-safe and concurrency-safe.

Already completed locations receive completion credit for all three levels. Preserve previously paid rewards and do not issue retroactive multiplied rewards. Existing completion records remain audit evidence. Unfinished attempts are not completion credit.

## Data and server contract

Keep existing bonus-game IDs as location IDs rather than creating three new catalog locations. Add level-aware progress keyed by user, location and level; retain the existing location completion contract for sequence compatibility. Level-1 completion supplies location completion for new players.

New attempts record their selected level and immutable level-specific rules and reward snapshots. The server validates the level, unlock conditions and enabled mechanics; client visibility is not an authorization boundary. Catalog responses expose each level's availability, completion and reward. Start requests select the level explicitly; omitted level uses level 1 for new attempts.

An active legacy attempt remains resumable using its original rules, revision, reward and validation contract. Never rewrite snapshots or validate old attempts against new disabled/enabled mechanics. Its successful completion receives legacy completion credit under the same migration policy, with only its existing reward. Preserve the current active-attempt invariant: changing a selected level must not silently replace an unfinished attempt.

Additive migration/backfill must be idempotent and must not alter balances, ledger entries, auth or production availability. Keep Challenges closed in production.

## Shared gameplay

Derive level rules once on the server and use the same deterministic game-core contract for validation and rendering. Use explicit feature flags where removing an environment object would also remove required base movement or slope physics. Disabled mechanics must have no scheduled events, interactions or movement effects. Retain legacy behavior through versioned snapshots; assess game-core version compatibility before changing deterministic behavior.

## Client

Within the existing location preview, show three selectable levels with locked/completed states, cumulative mechanics and selected reward. Reuse existing modal structure and artwork. Explain which preceding level unlocks a locked level. The main location card continues to reflect location progression, with level progress visible without creating duplicate location cards.

Resume an active attempt as that attempt's level. Handle stale catalog state and server lock errors with a readable message and refresh, without starting another level optimistically.

## Verification and delivery

Cover level rule matrices and deterministic behavior; level-1 location unlocking; level-2/3 locking; reward multipliers; repeat and concurrent completion; legacy backfill and immutable attempt resume; and UI selection/rewards/errors. Verify the real local catalog, preview and attempt flow at mobile width. Run applicable type checks, builds and package regressions using isolated test services.

Work in feature/challenge-three-levels based on origin/dev 89ba0e94ea3cf4106695e52140ae6a23cd51134b. Preserve unrelated main-checkout changes. This task authorizes local implementation; dev deployment requires a subsequent release instruction. Report local checks, CI, browser acceptance and deployment separately.
