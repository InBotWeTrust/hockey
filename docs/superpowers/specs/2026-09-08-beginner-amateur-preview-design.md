# Beginner Amateur Preview Design

## Goal

Let beginner players explore the complete Amateur area before unlocking Amateur status, while preventing them from performing Amateur-only actions. Give beginners a limited playable preview of Bonus Games: the first two games in each skill category, unlocked in sequence.

The preview should explain the value of Amateur status without allowing client-side or direct-API bypasses. Progress toward Amateur remains based only on goals scored in the normal beginner daily game.

## Player Experience

### Sections screen

The `Любители` card is always rendered in full color and always opens the Amateur hub. It is no longer visually or navigationally disabled for beginners.

For a beginner, its supporting text shows the live remaining requirement, for example:

`Осталось 184 шайбы до статуса «Любитель»`

The remaining number is `max(0, configured unlock requirement - qualifying daily goals)`. Amateur and professional players continue to see the normal section description.

### Read-only Amateur area

A beginner may navigate through and inspect:

- the Amateur hub;
- duel lists, ratings, history, rules, and opponent profiles;
- tournament catalogues, details, rules, standings, schedules, playoffs, and results;
- the Bonus Games catalogue and game details;
- any other non-mutating Amateur information introduced later.

Navigation, tab changes, filters, expandable information, modal opening, and back actions remain available. A beginner restriction applies only when an interaction would create or mutate Amateur gameplay or economy state.

### Restricted action feedback

Amateur-only action controls remain tappable so the player receives an explanation instead of a dead control. Attempting a restricted action shows one shared compact account-status toast:

- title: `Нужен статус «Любитель»`;
- body: `До открытия осталось забить N шайб в ежедневной игре.`

The toast uses the current configured threshold and server-derived qualifying progress. It is accessible through a polite live region, does not block navigation, disappears automatically, and replaces an already visible copy instead of stacking duplicates.

Examples of restricted actions include creating, accepting, declining, joining, or playing an Amateur duel; registering for, withdrawing from, or starting a tournament action; and any other Amateur mutation not explicitly allowed below.

## Bonus Games Exception

Bonus Games remain grouped by their existing skill category (`speed` and `accuracy`). Within each category, active games are ordered by the existing stable catalogue order (`sort_order`, then id).

For a beginner:

1. The first game is available immediately, subject to its existing access type and all ordinary attempt rules.
2. The second game becomes available only after successful completion of the first game.
3. A paid second game still requires its configured star purchase. No free unlock is introduced.
4. The first and second games may be replayed after completion.
5. The third and all later games stay visible but are level-locked until Amateur status.

Existing behavior remains unchanged for:

- the daily attempt allowance per category;
- active-attempt continuation and abandonment;
- inventory rules;
- paid unlock ownership;
- first-clear rewards being issued only once;
- Bonus Game goals not contributing to Amateur unlock progress or ordinary lifetime gameplay statistics.

A beginner may perform all existing mutations required to purchase, start, continue, abandon, and finish the first two eligible games. Those operations are the only exception to the Amateur mutation restriction.

## Authorization and Contracts

### Shared eligibility result

The server owns the authorization decision. A shared Amateur access service resolves:

- `competitionLevel`;
- configured `unlockGoalsRequired`;
- qualifying beginner daily goals;
- `goalsRemaining`;
- whether the player has full Amateur access.

Web code may use the same fields to present the preview, but client checks are not authorization.

### Restricted mutations

All Amateur mutation routes use the shared eligibility service before changing state. A restricted beginner request returns an expected non-2xx response with a stable public error code such as `amateur_level_required` and safe structured details containing `goalsRemaining` and `unlockGoalsRequired`.

The web client maps this code to the shared account-status toast. Internal error names or raw server messages are never shown to the player.

Read-only endpoints remain available to authenticated beginners. Responses must not hide catalogue entries merely because the player is a beginner.

### Bonus Game catalogue

The server derives beginner Bonus Game card states by category position:

- positions 1 and 2 use the normal sequence, purchase, active-attempt, and completion rules;
- position 3+ resolves to `level_locked` for beginners;
- full Amateur players keep the current catalogue rules.

Bonus Game mutation routes validate the same category-position rule. Directly calling a third or later game route must return `amateur_level_required`, even if stale client state renders it incorrectly.

## Web Architecture

The web app uses one reusable Amateur access presentation layer rather than embedding separate copy in every screen:

- a small selector/helper derives beginner preview state and remaining goals from current profile/game settings data;
- one global or Amateur-shell toast component presents `amateur_level_required` feedback;
- action handlers use a shared guard for immediate feedback;
- API error handling provides the authoritative fallback for stale state and direct navigation.

Read-only navigation is never wrapped in the action guard. Bonus Game actions rely on their server-provided card state and the shared expected-error mapping.

## Compatibility and Data

No destructive migration is required. Existing users, completions, paid unlocks, active attempts, rewards, and statistics are preserved.

If persistence is needed for configurable preview limits later, it is out of scope. The initial contract fixes the preview limit at two active catalogue games per skill category and centralizes that constant in server code.

Existing beginners who previously obtained Amateur data retain it. They may view that data, but cannot create new Amateur-only mutations unless covered by the Bonus Games exception or they regain Amateur status.

## Failure Handling

- If profile or progress data is still loading, the UI allows read-only navigation but does not optimistically authorize an Amateur mutation.
- If the server cannot resolve access, the request fails safely with the existing generic retry message, not with a fabricated remaining-goals count.
- If the configured unlock threshold changes, the next profile/access response updates both the card and toast copy.
- Concurrent clients cannot bypass the rule because authorization is checked inside the mutation request path before state changes.

## Testing

Server tests cover:

- beginner read-only access to Amateur catalogues and detail endpoints;
- rejection of every Amateur mutation family with no state changes;
- structured `amateur_level_required` response and accurate remaining goals;
- first game available in each Bonus Game category;
- second game sequence and paid-purchase behavior;
- replay of either eligible game;
- third and later games rejected for beginners;
- unchanged full access for Amateur and professional players;
- Bonus Game results do not advance Amateur unlock progress or duplicate first-clear rewards.

Web tests cover:

- full-color Amateur card and successful navigation for beginners;
- remaining-goals supporting text;
- free read-only navigation across duels and tournaments;
- restricted action toast content, replacement, timeout, and accessibility;
- allowed first-two Bonus Game actions;
- locked third-game feedback;
- expected server errors producing the same toast without raw codes.

Rendered QA verifies beginner, Amateur, and professional accounts on compact and normal mobile viewports. It includes direct URLs to an Amateur mutation and to a third Bonus Game to confirm the server-backed restriction.

## Non-goals

- Changing the Amateur unlock threshold or which goals qualify.
- Awarding Amateur rating, tournament participation, inventory benefits, or other Amateur progression to beginners.
- Making paid Bonus Games free.
- Changing daily Bonus Game attempt limits, rewards, statistics, or existing game definitions.
- Hiding Amateur content from beginners.
- Changing professional-level access rules.

## Acceptance Criteria

1. A beginner can open and browse the Amateur area from a full-color card.
2. Read-only interactions work without restriction messages.
3. Every Amateur-only mutation is blocked on both client and server and explains the live remaining daily-goal requirement.
4. The first two ordered games in each Bonus Game category follow normal sequence, payment, replay, attempt, and reward rules for beginners.
5. Games three and later remain visible but cannot be started or purchased by beginners.
6. Amateur and professional behavior is unchanged.
7. No Bonus Game goal contributes to Amateur unlock progress.
