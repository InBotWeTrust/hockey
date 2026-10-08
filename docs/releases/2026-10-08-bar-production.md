# Isolated match-bar production release

## Scope and provenance

Base: `origin/main` at `0edfcfa0d08fbc9b25f554abc735617c71044ec1`.
Source feature: PR #245 (`419675b6`); artwork: PR #249 (`ca865ffe`).
This branch ports selected files and integration hunks, not the dev commit ancestry.

Included: authenticated bar board and delayed spectator replay, duel invitations,
public tournament fixtures, embedded match chat with replies and reactions,
Sections card and bottom navigation context, two optimized versioned WebP assets.
Existing gameplay, game-core, inventories, onboarding, fights, bonus games,
workflows, package manifests and lockfile remain the main baseline.
The common ResultModal only adds an opt-in contained mode; PixiStage only adds an
optional resolution cap, preserving existing defaults. Spectator constants are
separate modules; PlayView and DailyScreen are not refactored in this port.

## Schema compatibility

Only two new migrations:
- `191_match_bar_read_indexes.sql`: two concurrent read indexes, without a
  transaction so existing gameplay writes remain available during indexing.
- `192_match_bar_chat.sql`: new `bar_match_chat` mapping table referencing chats.

Existing migrations are byte-for-byte unchanged. No data copy, reset or seed
import from dev is part of this release. Production deployment must first check
its actual migration ledger and obtain a fresh backup via the release procedure.
No production database has been accessed or modified during preparation.

The bar used dev fight pause columns absent from main. The port reads optional
pause attributes through `to_jsonb` with null/zero defaults, without importing
fight migrations. On a disposable PostgreSQL database migrated from this branch,
a real two-player synthetic duel and confirmed shot pass; the unchanged dev
query fails with `column m.fight_paused_at does not exist`.

## Verification and limits

Local: game-core/server/web builds, typecheck, lint, focused bar, chat access/list,
Sections, navigation and ResultModal tests; PostgreSQL integration tests run on
an isolated temporary container with synthetic rows. Browser: 430x800 synthetic
preview, both rinks and chat input visible; Sections card opens the bar board.
The preview harness is untracked and excluded from the release.

CI, deployed runtime provenance and authenticated real-player acceptance are
separate gates. This document does not claim production deployment or capacity QA.

Spectator replay retains the MVP limitations: reconstructed movement between
confirmed shots, fixed puck flight time, no exact inventory/fatigue behavior
before the first shot, no stumble/within-period exhausted-rest replay. Period
breaks and confirmed shot outcomes are replayed. These limitations are not
expanded into unrelated gameplay work by this release.
