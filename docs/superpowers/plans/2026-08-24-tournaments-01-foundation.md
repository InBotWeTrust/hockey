# Tournaments 01: Foundation Implementation Plan

**Goal:** Establish tournament contracts, persistence, feature gating, and reusable tournament settlement boundaries without changing ordinary duel behavior.

1. Add failing unit tests for configuration validation, lifecycle transitions, and tournament settlement policy.
2. Add the additive tournament migration and migration assertions.
3. Introduce focused modules under `packages/server/src/tournament/` for types, config parsing, lifecycle, repository mapping, and service orchestration.
4. Extend duel source/settlement contracts with `tournament` while preserving existing challenge and matchmaking behavior.
5. Register tournament routes and scheduler behind `tournaments.enabled` and run server regressions.

