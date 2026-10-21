# Bar game thumbnails v1

Generated with the built-in image_gen tool on 2026-10-21. Seven square WebP assets, 128 × 128, in `packages/web/public/bar/game-thumbnails/`. UI displays them at 40 × 40 with 10 px rounded corners. Original generated PNGs remain in the Codex generated_images folder.

## Shared prompt

Use case: stylized-concept. Asset type: one small game thumbnail for a 40-pixel UI crop in a hockey bar mobile game. Create a single square image, one centered composition only. Polished miniature game-object illustration with tactile realistic materials, softly rounded clean forms, bold readable silhouette and restrained detail. Main objects large in the center, all essential details inside the image. Plain subtly textured charcoal navy backdrop; no border or framing circle. Soft warm key light plus cool rim light. No decorative text, labels, logos, watermarks or panels. Consistent set, simple and readable at tiny size.

## Subjects

- `darts-v1.webp`: A dartboard seen almost straight on, with one red-feathered dart lodged in the bullseye. The round dartboard is the dominant object.
- `checkers-v1.webp`: A wooden checkerboard in perspective with three large contrasting ivory and black checker pieces.
- `billiards-v1.webp`: Three glossy billiard balls including a black eight ball and a short diagonal cue on green felt. No hands.
- `ochko-v1.webp`: Two overlapping playing cards, an ace and a king, on green felt. Clear heart and spade pips, no table score.
- `battleship-v1.webp`: A gray battleship model on a dark teal ocean grid, with a red target marker beside it.
- `cards-v1.webp`: A fan of four cards with red and black suit pips beside a small facedown deck on green felt.
- `armwrestling-v1.webp`: Revised after rejecting detached forearms. A coherent miniature sports scene with two generic athletes facing each other at a compact arm-wrestling table. Complete bodies including shoulders and heads; arms visibly attached to shoulders, right hands clasped over the table, elbows on pads. Dark blue and red athletic T-shirts. Natural anatomy, no detached or severed limbs. Both people and whole tabletop fit inside the image with padding. Anonymous faces, miniature sports scene rather than portraits. Charcoal navy background, warm/cool rim lighting, no text or logos.

Thumbnails use versioned filenames and one-year immutable HTTP caching. A dedicated CacheFirst service-worker cache retains successful same-origin responses for one year (32 entries maximum). Use a new filename version for replacement artwork.
