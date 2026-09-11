# Monthly Rating Final Placement Design

## Goal

Record one immutable, shared monthly ranking for every player who completed a ranked duel. Use it for monthly prizes, `monthly-top-1`, `monthly-top-3`, and historical rating display.

## Ranking

For every settled, ranked non-tournament duel attributed to the month, rank players by:

1. total rating points, descending;
2. points earned in head-to-head games inside the group tied on total points, descending;
3. total completed duels, descending;
4. total wins, descending;
5. display name and user ID only as a deterministic final fallback.

There is no minimum-match threshold. A player who has at least one completed ranked duel is in the final monthly ranking and can receive a prize or a top-three achievement by that position.

## Snapshot and repair

`monthly_duel_rating_placement` becomes the complete final snapshot, not an eligible-only list. Existing closed months are rebuilt from the immutable rating-match ledger in a forward migration. Existing economy events remain intact; the migration only updates the placement facts and adds missing rows. A follow-up audit removes an achievement when its user is not top one/top three in the rebuilt snapshot, reversing a claimed reward atomically.

## Client contract

For a closed month, the rating route reads the placement snapshot so the user-visible table cannot diverge after closure. Current, open month continues to use the live rating aggregate.

## Safety

All data operations are forward-only and transactional. Dev and prod are audited before applying the repair. No development database is copied to production.
