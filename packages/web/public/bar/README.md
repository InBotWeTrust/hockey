# Restaurant artwork

`restaurant.webp`: generated with the built-in imagegen tool for this feature, inspected, resized to 1280px and encoded as WebP at quality 80 (~159 KiB). Used for the Sections entry card and the /bar background.

Prompt: Create one polished raster background illustration for a mobile hockey game's sports bar. A cozy premium beer restaurant interior with warm amber pendant lights, dark walnut bar counter, leather booths, brick walls, beer taps, subtle hockey sticks and framed hockey jerseys, two large televisions in the upper rear wall showing indistinct ice rinks without text. Empty restaurant, no people. Attractive atmospheric semi-realistic game environment art with rich depth and restrained detail. Wide 3:2 composition that also crops well to a portrait mobile background: central view into the room, important interior cues in the central half, warm edges and darker calm lower center to allow UI overlay. No lettering, no logos, no watermark, no UI, no readable signs. High quality, inviting and tasteful.

## Sports bar artwork v2

Generated with the built-in imagegen tool, using restaurant.webp as the reference.

- bar-card-v2.webp: square 512px, walnut counter with drinks, beer taps and a large hockey screen, composed for the 86px Sections card.
- bar-interior-v2.webp: portrait 9:16 background (948×1659px); retains the original warm lighting and materials, replaces the fireplace and lounge armchairs with ordinary tables and chairs for viewing matches.
- Both outputs inspected and encoded as WebP at quality 82; the original artwork is retained.

Prompt structure guidance: Image skill by Serge Shima (https://github.com/smixs/visual-skills), CC-BY-4.0.

## Finished renovation artwork v4

Generated with the built-in imagegen tool from the production maintenance images `bar-repair-interior-v3.webp` and `bar-repair-card-v3.webp`. Their SHA-256 values were verified against the public production assets before generation. Reference originals are preserved in the production branch.

- `bar-interior-v4.webp`: 900 × 1600, WebP quality 82, 163400 bytes. Used by `.bar-screen`, including the card lobby.
- `bar-card-v4.webp`: 512 × 512, WebP quality 82, 61270 bytes. Used by the Sections bar entry.
- Sources: `exec-92102911-9163-45fa-90b6-b5be0d8708c2.png` and `exec-329e1df0-4e75-45bd-a8f6-7e03a66bdaa1.png` in the Codex generated-images directory for conversation `01a11730-ea29-7fc2-93df-cec3a1c576c7`.

Background prompt: transform the exact renovation site into the same completed hockey bar. Preserve the portrait camera angle, tall industrial room, black-framed windows on the left with blue snowy winter twilight, brick pilasters, overhead beams and ducts, and counter on the right. Finish walls, dark walnut bar, brass taps, glass shelving and dark wood floor. Replace tools and construction materials with ordinary rectangular tables and chairs, keeping a clear central walkway. Add a hockey television on the rear wall. Warm amber lamps with cool blue window light, calm darker lower center for interface readability, polished semi-realistic game rendering. No people, logos, typography, construction leftovers, fireplace or lounge sofas.

Card prompt: transform the exact square renovation reference into the finished bar, using the completed portrait as a second reference for matching furniture, materials and lighting. Preserve windows on the left, counter on the right, ceiling beams and pendant lamps. Show the hockey screen, walnut counter with brass taps, and an ordinary table near the windows. Tight readable square composition for an 86-pixel thumbnail. No people, logos, readable signs, typography, construction leftovers, fireplace or lounge sofas.

## Ten-location bar background

`bar-west-v1.webp`, `bar-middle-v1.webp`, and `bar-east-v1.webp` are three newly generated illustrated sections, converted to WebP at quality 94 without resizing. BarPanorama mounts all sections and character compositions on one translating track. Backgrounds use cover to preserve proportions. Original PNGs remain in the generated-images directory.

Sources: exec-21547648-2d06-45c4-b8d7-1537309bbeea.png (west), exec-a90a11fe-15df-4e55-8e0c-50a8e2af8f46.png (middle), exec-7dc65712-06c8-4f8e-946d-9f3ff904162f.png (east). The terminal niche has no guests; the eastern section reserves bar-counter space for newspapers.
