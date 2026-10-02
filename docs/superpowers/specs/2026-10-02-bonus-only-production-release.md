# Bonus-only production release

## Approved scope

Release the bonus-game work from dev plus the user-selected narrow exception
`66b48ad255c51897c26e288d4f91200290819f14` (PR #212): identify an opponent's gameplay
lock in ordinary duel invitations. Its five changed paths are explicitly
allowlisted. Do not release exercises, training, onboarding, any other
duel/tournament changes, ratings or other dev features.
The four playable tracks retain the reviewed city artwork, rewards and rules.
The fifth tab, «Испытания», remains visible but closed in production. Clicking it
shows exactly «Раздел в разработке». Direct links and API actions cannot bypass
the closure. Local/dev challenges remain available. Production retains two daily
attempts per track; local/dev retain 100.

Existing game IDs, purchases, completions, balances, rewards and historical/active
attempt snapshots must be preserved. Do not grant synthetic completions or copy a
dev database to production. Take a fresh recoverable production backup before
authorized migrations. Release through the normal production Actions workflow.

## Verified starting points

- Production base: `b85823e81a5dc8e64a04012610e9cc6fd07d3b04`.
- Source dev: `f69b62302b8eafcf61f3bd6b9b2a80c7421d8b7f`.
- Source range contains 264 commits and 607 changed files, not a bonus-only patch.
- Shared core version is 63 on main and 71 on dev. Shared files must be reviewed
  hunk by hunk; version changes need explicit compatibility tests across modes.

These refs must be refreshed before release. Neither a dev screenshot nor a green
dev workflow proves that the extracted main-based patch is compatible.
