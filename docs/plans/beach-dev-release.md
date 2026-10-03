# Beach server integration and dev release

Approved scope: real server-authoritative Beach attempts on dev, including seven puddles, cleanup, wind, 30% stumble movement and preview guidance. Production stays closed. Existing IDs, rewards, progress and immutable snapshots are preserved. Other bonus modes retain current behavior.

- [x] Fetch and verify origin/dev: 30389da70765180b5ae231c7f87ef986e9819c3f; isolated task branch feature/beach-gameplay.
- [x] Move fixture interactions into deterministic versioned core; seeded 10-gust schedule in each new attempt snapshot, cleanup reconstructed from append-only events.
- [x] Add bounded schema, atomic owned/idempotent cleanup endpoint and authoritative shot reconstruction. Cover stale/reordered/duplicate cleanup, shot overlap and period expiry.
- [x] Add compatible migration for cleanup history and new Beach catalog profile; do not touch existing attempt snapshots or rewards.
- [x] Enable challenges only in explicit development deployment config; production tab and direct routes stay blocked.
- [x] Connect client cleanup with pending-action guards and monotonic event reconciliation; render/resolver use the same environment/motion clocks. Update existing preview and one-notice guidance.
- [x] Run RED/GREEN feature checks, affected regressions, builds and production gate tests; inspect full release diff.
- [ ] Commit task branch, PR to dev, merge within authorized dev release scope, wait for matching Deploy Dev Actions run.
- [ ] Verify exact runtime SHA, health, migrations and actual rendered attempt flow. Report local/CI/browser/runtime separately.

No standalone playground page deployment. Wind and cleanup now use shared deterministic functions, immutable per-attempt schedules and server event persistence. Local integration tests use the isolated uh_beach_release_20261002 database. Deployment and rendered acceptance remain pending.
