# Unified Glass And City Balance Design

## Scope

Apply the Bonus Games catalog glass material throughout the application while preserving the entire personal-profile tab and its nested screens. Update the 13 Accuracy World Tour city games through a forward-only migration. Deploy only to `dev`.

## Accuracy World Tour

Every city uses one period, no break, and the same movement settings:

- goal frequency: `0.50`
- goalie frequency: `0.60`
- shooter frequency: `0.75`
- puck speed: `1.25`

The goal and shot limits are:

| City           | Goals | Shots |
| -------------- | ----: | ----: |
| Moscow         |    18 |    30 |
| Istanbul       |    21 |    30 |
| Rome           |    23 |    30 |
| Paris          |    30 |    45 |
| London         |    36 |    50 |
| New York       |    40 |    50 |
| Rio de Janeiro |    42 |    50 |
| Cape Town      |    47 |    55 |
| Dubai          |    49 |    60 |
| Mumbai         |    52 |    60 |
| Singapore      |    66 |    80 |
| Beijing        |    76 |    90 |
| Tokyo          |    90 |    90 |

The migration updates catalog definitions and revisions but preserves active attempt snapshots. New attempts use the new settings; attempts already in progress finish with their original immutable snapshot.

## Glass Material

Use a shared material family derived from the approved Bonus Games catalog:

- cards: `rgba(226, 233, 241, 0.74)`
- filters and chrome: `rgba(226, 236, 246, 0.78)`
- elevated surfaces, dropdowns, and modals: `rgba(237, 244, 250, 0.84)`
- light borders: `rgba(255, 255, 255, 0.78)` or stronger on elevated surfaces
- blur: `16-20px` with mild saturation

Shared CSS custom properties are the single source of truth. Existing component selectors consume those properties instead of introducing one-off opacity values. Dark active buttons, semantic status colors, rewards, game HUD elements, and media remain visually distinct.

## Profile Exclusion

`/profile` and every route nested under `/profile/` receive a dedicated profile-tab surface class and retain their current materials. Public user pages opened from other sections are not part of this exclusion.

## Coverage

Audit and update cards, headers, segmented filters, dropdown menus, balances, calendars, lists, modals, store products, inventory, achievements, chat, tournaments, duels, training, daily overview, section hubs, and admin surfaces. The personal-profile tab is unchanged.

## Verification

- migration integration test validates all 13 rows, exact goal/shot pairs, common movement settings, one period, no break, revision increment, and preserved attempt snapshot
- route tests validate unified-glass and profile-tab scoping
- CSS behavior test validates resolved card/filter/elevated materials
- local rendered QA covers representative surfaces in Sections, Amateur, Bonus Games, Daily, Training, Achievements, Store, Tournaments, Chat, and Admin plus a profile non-regression check
- typecheck, lint, build, full tests, diff review, PR to `dev`, official Deploy Dev, runtime SHA and health verification
