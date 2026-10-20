# Bonus records: local implementation

Approved scope: feature/challenge-three-levels; four non-challenge modes. No deployment authorized.

- Record settlement and awards are part of the successful attempt transaction. User/balance locks precede the per-game advisory lock. A unique attempt outcome makes retries idempotent.
- Ranking conditions fingerprint qualification, periods and inventory policy, ignoring artwork/title/revision. The fingerprint's policy version must change when a future simulator change alters non-challenge comparability without a rules change.
- Endurance successful duration is fixed within the condition version. Ordering by descending goals is exactly ordering by duration/goals, without rounded floating point division.
- Active elapsed time is archived period durations plus the current period. Marksmanship uses the accepted final shot timestamp (including result pauses), consistent with qualification. Legacy marksmanship reconstructs it from the accepted final shot; missing archives are excluded.
- Legacy completions retain leaderboard access. Backfill records does not generate reward events or update balances.
- Results persist the awarded bonuses, personal best and place as of completion. The leaderboard returns live ranks.
- Local fixtures: /bonus-records-preview.html, ?view=result; ?skill=accuracy/marksmanship/endurance. Synthetic data only; no auth state or real account changes.
- Accuracy clarification: rank by exact goal ratio, then active time. The integer rank key is floor(goals*1e12/shots) with a checked shots bound of 1e6. Distinct bounded fractions differ by at least 1e-12, so the key preserves ordering and ties exactly; rounded display percentages never participate.
- Independent review found no issues. Server bonus-game scope: 308 tests passed on the existing dedicated local uh_ski_20261003 database. Legacy migration test: 1 passed. Web record modal/result tests passed; further visual adjustments are being verified.

- Additional verification: record integration including top-100 pagination/current user below cutoff, migration and comparator suites pass; authenticated API tests pass. Web suites: 142 passed, plus presentation updates checked by targeted suites. Server/web builds, typechecks, scoped lint and diff check passed. Mobile fixture verified at 320/375px. CI, authenticated live gameplay browser acceptance and dev deployment were not run.
