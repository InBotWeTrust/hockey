# Bar fight artwork

Runtime WebP assets for the winter street outside «4-й период».

- Oleg poses: existing `output/imagegen/security-guard-v1/guard-poses.png`.
- Player identity reference: user-supplied `Игрок сетка.png`.
- Corrected player sheet: generation `exec-8222c7a4-8485-4dd9-b99b-6b8bd7eccb68.png`.
- Portrait street: generation `exec-913c03f2-ab6a-483d-b055-eb1bb29ae37e.png`.
- Square defeat: generation `exec-91398ffa-503c-4948-a8b3-c06311ff9972.png`.
- Square victory: generation `exec-a07fa4d1-2e9d-430b-99f0-d9aa2e90c2f6.png`.

Player: original face, navy beanie, blue hoodie and trousers, black sneakers,
bare hands. Pose files share a transparent 384×512 canvas and a ground baseline.
Original source sheets were preserved. Results are square; the fight background
is portrait. Only the bar sign contains text.

Blocked-entry modal: `oleg-blocked-v1.webp`, square 1024×1024, generated from
Oleg's existing avatar and the winter street reference. Source generation:
`exec-e409eb45-5ff1-496a-94dc-d0df93e863b4.png`. Original source preserved.

## Version 2: standalone city bar

The active environment is a substantial detached two-story sports bar in a
well-maintained city neighborhood, without festive decorations. Version 1
files and original source generations remain preserved.

- `street-v2.webp`: portrait 1024×1536; source `exec-a24845c7-ae7a-4468-95aa-802f09c1d741.png`.
- `player-win-v2.webp`: square 1024×1024; source `exec-46532302-78fc-4a9f-91fd-3067c352e642.png`.
- `player-loss-v2.webp`: square 1024×1024; source `exec-d5ca7292-8cda-4300-b560-461703ecbc66.png`.
- `oleg-blocked-v2.webp`: square 1024×1024; source `exec-3b71dc1b-5746-47d8-b334-b91865fd22cf.png`.

All three square scenes use the version 2 facade as an environment reference
and the version 1 characters as identity, clothing and pose references.

## Player poses version 2

Ten transparent 384×512 poses from generation
`exec-15778675-ceae-4d51-8ccc-1f84fb25fe3f.png`, using the original player identity
sheet and version 1 poses as references. Revised taller stance and longer legs;
navy beanie, blue hoodie and striped trousers, black sneakers with white soles,
bare hands. Uniform scaling across all poses; foot baseline at y=460.
Oleg continues to use his unchanged version 1 frames.

Preparation: `pnpm --filter @hockey/web exec node scripts/prepare-bar-player-v2.mjs <source-sheet-path>`.
