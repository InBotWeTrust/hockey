# Tournaments 04: Playoffs and Rewards Implementation Plan

**Goal:** Run fixed playoff brackets, multi-segment fixtures, series, bronze games, and exactly-once stage rewards.

1. Test brackets for 2/4/8/16 seeds and the mandatory third-place series.
2. Test home sequences, early series completion, regulation/overtime/shootout progression, and sudden death.
3. Implement fixture-to-duel segment orchestration and tournament-only settlement callbacks.
4. Implement series advancement, double-no-show pauses, incident resolution, and final placement.
5. Implement idempotent regular/playoff rewards and activate tournament achievement events.

