# Ordinary duel fight artwork

Character reference: `a34af43c`, `docs/artwork/player-customization/sources/base-locker_front-right.png`, from the locker-room appearance work. Preserve the face, short brown hair, stubble and natural athletic proportions.

User direction: no helmet, hat, gloves or hockey stick; bare fists; serious idle expression. Two prepared variants: blue locker-room clothing in `hoodie-poses-v1.png`, and the red-blue-white hockey uniform used by the duel renderer in `packages/web/public/sprites/fight/jersey-atlas-v1.png`.

Both images were prepared with the built-in image generator. Existing hockey/appearance assets were not replaced. Only the final selected variants are included; intermediate generations remain outside the repository.

Runtime atlas: four columns and two rows, row-major idle / attack_head / attack_body / block_head / block_body / hit / lose / empty. `fightArt.ts` selects padded frame rectangles from the atlas and normalizes the skate baseline through Pixi texture trim offsets. Opponent frames mirror the unbranded artwork. No gameplay timing, HP or reward comes from artwork metadata.

Browser checks use the actual `FightView` renderer in a temporary art fixture, not a new production route. Dedicated tests cover distinct seven frames, mirrored facing, baseline and canvas resizing. Real two-player gameplay was checked separately before this artwork replacement; this art fixture does not establish backend/release acceptance.

Fight background: `packages/web/public/sprites/fight/amateur-fight-background-v1.png`, a single built-in image generation based on the runtime ordinary amateur court `packages/web/public/sprites/amateur-daily-court.webp`. Generated 2026-10-06 from `exec-124d21ff-0433-4d5e-ba08-cadf22936b25.png`. Preserves the winter neighborhood, low changing-room building, warm lamps, chain-link fence and boards; lower rink-side camera and clean foreground ice suit the larger fighter art. Used only by the fight modal; original court unchanged. Decorative floor ellipses removed.


## Fight challenge fist icon

- Source: `/Users/egorgumenyuk/.codex/generated_images/01a11226-2b24-7900-9c18-c6a9ec766ca3/exec-c05fb897-f080-434a-a873-aed394c31a4d.png`.
- Generated once with transparent background: bare clenched fist, red/blue hockey jersey cuff, equipment artwork style.
- Runtime asset: `packages/web/public/sprites/fight/fist-icon-v1.webp`, 64 x 64, RGBA, WebP quality 82, displayed at 27 x 27 inside the HUD circle.

## Hockey glove punch icon v2

- Replaces the bare fist HUD image at the user request: padded red/blue/white ice hockey glove in a foreshortened forward punch, short diagonal cuff instead of a hanging wrist.
- Built-in imagegen, one generation, transparent background. Source: `/Users/egorgumenyuk/.codex/generated_images/01a11226-2b24-7900-9c18-c6a9ec766ca3/exec-9f326b13-aa7e-4fb4-bc53-675a52aef969.png`.
- Runtime: `packages/web/public/sprites/fight/fist-glove-icon-v2.webp`, 64 x 64 with alpha, quality 82, shown at 27 x 27. Original source and prior icon preserved.
- Prompt: One transparent mobile hockey HUD icon; clenched fist inside a segmented padded ice hockey glove, red/deep royal blue/white, realistic painted equipment artwork, three-quarter foreshortened straight punch toward upper-right with short wrist/cuff behind to lower-left, bold silhouette readable at 27px; no bare fist, boxing glove, hanging hand, long forearm, bar, stick, logo, lettering, background, circle, motion blur or cast shadow.

## Bare punch variant v3

- User-requested alternative to the glove, created in one built-in imagegen edit using the glove v2 source as reference. Same forward punch perspective, bare clenched fist, short red/blue/white hockey sleeve edge; transparent background.
- Source: `/Users/egorgumenyuk/.codex/generated_images/01a11226-2b24-7900-9c18-c6a9ec766ca3/exec-07b1dc20-df45-40d6-89cb-ccaf966d2eef.png`.
- Variant asset: `packages/web/public/sprites/fight/fist-bare-icon-v3.webp`, 64 x 64 with alpha, quality 82. Selected by the user on 2026-10-07 and used by FightControls at 27 x 27; glove v2 preserved as an alternative.
- Prompt: Replace the reference padded glove with an anatomically correct bare clenched fist, natural light skin, knuckles closest to viewer toward upper-right, thumb wrapped under fingers, same foreshortened straight-punch perspective and painted game-art style. Replace wide glove cuff with a short red/deep-blue hockey jersey sleeve edge and white stripe. Keep transparent background, full object within square, bold silhouette readable at 27px; no glove, hanging hand, long arm, bar, stick, extra fingers, lettering, circle, cast shadow or motion blur.
