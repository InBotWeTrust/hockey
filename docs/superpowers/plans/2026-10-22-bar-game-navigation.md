# Bar game navigation and invitations

Scope approved in chat: fix locked controls after creating a card invitation, separate navigation from leaving, verify other bar games, expose resumable games in the floating monitor. Local only; no push/deploy.

- Reproduced independent StartupSplash/AccessibleModal inert ownership conflict, then shared reference-counted locks. Regression RED -> GREEN.
- Card room back returns without leave; all six bar game menus and card tables have independent return and surrender controls.
- Reuse existing lobby polls, account-scoped snapshots, and read active game details for monitor entries. Preserve saved Maria card party and return routes.
- Clarified timing: search stays 120 seconds; invitations are 300 seconds; duel defaults stay 900 seconds. No move/readiness/local-lease timer changes.
- PostgreSQL assertions observed old 60/120-second expiry RED, then 52 tests GREEN after invitation changes; client final 326 tests GREEN.
- Local browser fixture: waiting table -> back -> monitor -> same table, zero leave commands; light back visible. Authenticated production creation/acceptance not exercised.
- Depends on locally approved monitor icon and started-event pulse commit 713c694f.
