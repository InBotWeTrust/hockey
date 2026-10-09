# Bonus records and challenge production preparation

## Approved release behavior

- Records apply to speed, accuracy, marksmanship and endurance, separately per location.
- Personal improvement awards 2 stars / 10 XP; global improvement awards 10 stars / 30 XP. Keep the existing transactional records implementation.
- Starting previews show the personal and location records, reward explanation and two stacked dark actions: player ranking and play.
- Production challenges expose Beach with all three cumulative levels. Other locations stay visible and show `Локация в разработке` on click, including sequence-locked cards. Direct API launches/resumes/interactions are blocked for unreleased locations.
- The challenges section is available to amateur and professional users. Beginners retain only speed and accuracy access, including server enforcement.
- Future locations ship through a code release; no admin toggle or automatic monthly schedule.
- Keep the existing automatic two-frame finales on both first and repeat challenge finishes (2500 ms transition), optimized assets and caching.

## Source and integration boundary

This preparation branch starts at dev commit `88fc824e6d4b538e48d58d54c384f3a670513772`.
The existing records/levels implementation is in `4c1aef9d` (PR #241), finale wiring/assets in `f1cdc7cd` (PR #242), and the previous records entry in `e37572f0` (PR #243).
The preparation commit updates their UI and production availability; it does not independently contain their previous implementation.

Before a production release, assemble a scoped release PR including the required bonus-game implementation and assets. Do not merge the entire dev branch: the main/dev difference also contains unrelated training, duel fights and other features.
Check bonus migrations `174`, `175`, `176`, `178`, `187` and `188` against the actual production migration ledger and their dependencies. Use repository migrations and a fresh production backup; never restore dev data to production.
No production deployment or migration was executed during this preparation.

## Local verification

- 75 web tests: catalog/start modal, production Beach availability, unreleased sequence-locked location toast, beginner restrictions and records modal.
- 22 isolated server tests: release access guard and direct routes, beginner mode access, comparison helpers and challenge level configuration.
- Web production build, web/server typecheck, scoped ESLint and diff whitespace checks passed.
- Local synthetic browser preview inspected for records copy, stacked buttons and mobile layout. This is not authenticated production acceptance.
- 23 DB integration tests (catalog and records integration) skipped: dedicated TEST_DATABASE_URL / TEST_REDIS_URL are not configured in this checkout. Run them in an isolated integration environment before release.
- CI, dev deployment and production acceptance remain separate pending release checks.
