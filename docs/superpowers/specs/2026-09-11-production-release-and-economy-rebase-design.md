# Production Release and Economy Rebase Design

## Goal

Release the complete current `dev` state to production, permanently remove three explicitly identified production accounts, and make every surviving user's coin, star, experience, and reward-token balances equal the current reward values of that user's completed achievements.

## Account scope

Delete only these immutable user IDs:

- `32206bf3-0bfd-4e88-ac6d-85b4485dd967` — Andrey Rubtsov, VK provider UID `92249804`, the older account with the unique 200x200 avatar.
- `873d6bd2-294d-49d2-a895-ffa7a352dec5` — Пора Белум.
- `5b9a36a1-6211-438e-95f0-d2e2ce173980` — River.

The second Andrey Rubtsov account, `1df9ce1e-e42f-4a71-a995-abde780d3ba2`, must survive.

## Data operation

Implement a production-only CLI with dry-run as the default and `--apply` as the only mutating mode. Both modes run the same transaction; dry-run rolls it back after producing the report. Apply mode writes a unique operation record so a repeated invocation is a no-op.

Before deleting the target users, delete their authored messages and comments, and transfer ownership-only foreign keys for shared chats, tournaments, revisions, adjustments, broadcasts, and tournament decisions to the surviving admin account. Recompute each affected chat's `last_message_at`. Then delete the three user rows so cascading foreign keys remove their private progress, authentication, gameplay, inventory, notification, and reward data.

For every surviving user, calculate reward totals from all rows in `user_achievements` joined to the post-migration `achievements` catalogue. Set:

- coins to the sum of `reward_currency`;
- stars (`users.xp`) to the sum of `reward_stars`;
- experience (`users.experience`) to the sum of `reward_experience`;
- reward tokens to the sum of `reward_tokens`.

This includes `amateur-ticket`; it does not change player level or amateur-access state. Mark every credited completed achievement as claimed so it cannot be claimed twice. Preserve the immutable currency ledger and append one auditable `admin_adjustment` per survivor containing the exact reset/reward deltas. Rebuild the achievement-only token ledger from current catalogue values while preserving non-achievement financial/payment history.

## Release safety

Use a clean worktree based on exact `origin/dev`. Add integration tests that execute the real data operation against fixtures. Rehearse all pending migrations and the dry-run/apply operation on a disposable restoration of a fresh production backup. Deploy only through the `main` GitHub Actions workflow. During the final data operation, stop production writers briefly, take a second fresh backup, run the command once, restart services, and verify exact SHA, health, migration ledger, account deletion, surviving user totals, and idempotency.

Rollback is restoration from the immediately preceding production backup plus redeployment of the prior image tag if application rollback is also required. Never copy the dev database over production.
