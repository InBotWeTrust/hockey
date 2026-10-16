# Bar games artwork and local verification

Branch: feature/bar-ochko-armwrestling. No dev or production deployment in this delivery.

## Artwork briefs

Generated with the built-in image tool, then resized/compressed with Sharp. Source PNG names below refer to the original generated outputs; runtime uses only committed WebP files.

- Grigory identity: approved bar/emotions/grigory/neutral-v1.webp, then corrected frontal invitation. All new result scenes require an upright frontal head and direct gaze. Player win means Grigory has lost: disappointed, no smile; player loss means Grigory happy; draw is neutral.
- Oleg identity: approved bar/emotions/oleg/neutral-v1.webp and armwrestling invitation. Player win means Oleg disappointed; player loss means Oleg delighted; draw neutral/tired.
- Online results: subject-only hockey pub card/armwrestling tables, no people, brighter victory, subdued defeat, balanced draw. No award is issued for online matches.
- Arm scene: one coherent portrait 2:3 image with Oleg seated opposite, right elbow planted on table, clasped working hands, player forearm continuing out of lower right edge. Player left hand on left support handle; Oleg left hand on right handle connected to shoulder above tabletop. Pose edits keep background/body/support hands and change working arms toward left/right. Relaxed-hand edit changes only player support grip.
- The rejected cutout assembly is not included. Final scene uses five coherent pose frames plus a masked relaxed-hand variant. Its current limitation is stepped pose interpolation (180 ms crossfade), not continuous skeletal animation. Viewer advantage moves left; defeat right.

## Asset budget and cache

20 versioned WebP assets, approximately 1.6 MiB in total; active arm scene preloads approximately 316 KiB. Existing nginx image policy: public max-age=2592000, stale-while-revalidate=86400. New URLs have v1 suffix; no previously deployed asset URL is overwritten. Public images are loaded on demand rather than added to the PWA precache.

## Asset inventory

| File | Dimensions | KiB | Source PNG |
| --- | --- | ---: | --- |
| arm-coherent-loose-v1.webp | 640 x 960 | 51 | exec-f4367cc1-80a8-464d-8186-0ab0872ae3e8.png |
| arm-coherent-neutral-v1.webp | 640 x 960 | 56 | exec-de025b57-7235-47c3-a09c-a433817edf81.png |
| arm-pose-left-half-v1.webp | 640 x 960 | 53 | exec-e665c7ec-7ff2-4283-8153-18a4ed56c744.png |
| arm-pose-left-pin-v1.webp | 640 x 960 | 50 | exec-e09058fc-6e07-43bb-b1b6-116b3ac5f3d8.png |
| arm-pose-right-half-v1.webp | 640 x 960 | 53 | exec-0346dcd2-dcb0-42ff-b8c9-28bba9cc4c84.png |
| arm-pose-right-pin-v1.webp | 640 x 960 | 53 | exec-6a241a5b-e413-49db-b2f5-7ae3dafee3a0.png |
| armwrestling-character-draw-v1.webp | 960 x 640 | 54 | exec-da4da8bd-fb81-4f48-8a85-2d1c5e4cd557.png |
| armwrestling-character-loss-v1.webp | 960 x 640 | 50 | exec-0b57111f-f73d-4aab-a991-6463440b4b22.png |
| armwrestling-character-win-v1.webp | 960 x 640 | 51 | exec-99b0548a-9fcc-48ff-9ffc-c36582634b37.png |
| armwrestling-invite-v1.webp | 960 x 640 | 56 | exec-fdf61d54-2d74-496e-85eb-537925c7eb6f.png |
| armwrestling-online-draw-v1.webp | 960 x 1152 | 130 | exec-909c1b3e-6455-4017-9f66-e0ad6ae5cb0e.png |
| armwrestling-online-loss-v1.webp | 960 x 1152 | 116 | exec-c1608d4f-f09a-44d1-aa07-2449085398d1.png |
| armwrestling-online-win-v1.webp | 960 x 1152 | 177 | exec-8221322d-ad28-4a9b-9dd5-a4a97e11189c.png |
| ochko-character-draw-v1.webp | 960 x 640 | 80 | exec-f0d1e782-ae50-4f6c-9d8b-584e8f294810.png |
| ochko-character-loss-v1.webp | 960 x 640 | 88 | exec-65b678b9-004d-4471-9d6c-c69bf6f14a64.png |
| ochko-character-win-v1.webp | 960 x 640 | 77 | exec-4d513f37-8f1c-45b1-a990-1e2fe7aae633.png |
| ochko-invite-v1.webp | 960 x 640 | 86 | exec-537722cc-3db8-42cc-8311-60689b65febe.png |
| ochko-online-draw-v1.webp | 960 x 1009 | 131 | exec-e5c8bccb-4928-4be6-87c7-ea2c6a58ac4d.png |
| ochko-online-loss-v1.webp | 960 x 1152 | 99 | exec-84b7c36d-db65-4e84-aff7-99d0f2c2300c.png |
| ochko-online-win-v1.webp | 960 x 640 | 102 | exec-95720c80-888d-45dd-a70f-8addfde3dedb.png |

## Local evidence and remaining acceptance

- Core bar games/layout/version: 72 tests passed, core build passed.
- Web games/cards/bar regression: 216 tests passed before the last notice regression was added; final totals recorded in validation.md.
- Server games unit: 16 tests passed before the last surrender regression; final totals recorded in validation.md.
- Isolated PostgreSQL schema: 15 integration tests passed; only a configured dedicated test database was used. Schema created and dropped by the suite. No real account/balance changes.
- Typecheck, lint and build passed locally; final rerun recorded in validation.md. Existing build reports large chunks and old Browserslist data; these are warnings, not acceptance evidence.
- Browser: local fixture at 360x780, Ochko hidden hand/stand/result and arm scene visually inspected. This is not authenticated API acceptance.
- Not run: physical two-finger phone interaction, authenticated browser clients, dev runtime or CI. No credentials or sessions created/reset.

## Implementation rulings

- Server decks use cryptographic shuffle independent of bot scheduling; deterministic core accepts explicit private decks.
- Existing integer star-wallet capacity retained; oversized potential winnings receive an explicit capacity error. Counteroffers above 30 otherwise remain allowed up to balance.
- Unsupported paid-engine state refunds once on reconciliation; invalid player commands do not refund.
- Arm input sequences are per player; stale global revision does not reject independent inputs. Surrender accepts older heartbeat revision but rejects a future revision.
- Modal overlays release arm controls, without pausing the match clock. Network request timeout 1000 ms; server input TTL 750 ms.
- Bot policies stay in the shared runtime to keep server and local preview behavior aligned.
