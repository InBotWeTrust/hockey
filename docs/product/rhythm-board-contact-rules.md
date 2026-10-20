# Rhythm board-contact rules

Approved behavior: duel series qualify from four consecutive goals. The fourth credits all four, each subsequent goal adds one. Bonus levels keep minimum series 2/2/3/3/4/4/5/5/6/7. Any non-goal ends the series in both modes. After every goal, board contacts start counting again; the third actual contact immediately ends the series. A goal launched exactly at that third contact starts a new pending series. Credited points are retained.

Duel notice: first goal “Серия началась”, then “Серия N”. Stripe yellow for 1–3, green at 4+. Miss/expiry hides the notice. Bonus notice keeps its per-level threshold tone.

Implementation:
- Shared contact count uses the same triangular movement phase as the renderer, counting each half-cycle boundary after the starting position. It is derived from the existing deterministic motion integral, including inventory/fatigue/stumble and flight stops; result pauses do not advance the scene.
- Server saves its own contact count in shot input/history. The client independently projects the same count for feedback. Bar/spectator scoring consumes the stored counts.
- New duels snapshot Rhythm version 4, minimum 4 and contact limit 3. Core version 116 preserves previous shot-physics compatibility.
- Additive migration 234 enables contact windows for new bonus attempts and updates descriptions. Old attempts, matches, records and rewards keep their rules; historical scores are not rewritten. Current bonus record buckets follow the existing rule-version mechanism.

Verification:
- RED observed for the four-goal threshold and a bonus goal more than two travelled widths away but still within two real contacts.
- GREEN: 23 core/version tests, including exact contact boundaries, phase offsets, reset after a goal, four-goal credit and contact freeze during flight.
- GREEN: 9 real local duel API tests including contact persistence, qualifying series, misses, expiry, settlement/tie-breaking and raw-goal statistics; 2 real bonus API/catalog tests; 10 bar service tests.
- GREEN: 109 UI tests including duel yellow/yellow/yellow/green notice states and bonus notice expiry at exactly the third contact.
- Repository typecheck/lint and web build passed.
- Internal browser rendered the actual duel notice component and confirmed yellow start/series 2/series 3, green series 4. Local bonus API/client were restarted with the new rules. A complete live duel browser playthrough is not claimed.

Known separate gap: the old bonus final-shot search fixture is excluded from the targeted bonus run; its previously documented failure is not claimed resolved. No dev/production deployment performed.
