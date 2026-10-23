# Single-armchair TV lounge, all lighting phases

All four lighting phases now use versioned `/bar/map-v38/{phase}-v1.webp` assets. Only the left TV armchair and low coffee table remain. The former right armchair area is clear rug/floor, leaving the separate foreground counter at x28.5–48.5% unobstructed.

Day, morning, sunset and night are fresh complete generations through built-in imagegen. Day v38 is the composition/style reference for the three new phases, not a raster edit target. Original PNGs and attempts remain unchanged in local `artifacts/bar-lounge-v38/`; exact final prompts are stored here. Sunset attempt 1 was rejected for duplicate visible suns; the selected fresh attempt 2 uses only the colored twilight sky.

Runtime WebP encoding: cwebp quality 88, preserving native dimensions without raster retouching/resizing; PNG masters are unchanged. Day is 2172 x 724; the three other native outputs are 2170 x 725, all rendered in the same normalized 3:1 scene coordinates. New assets are roughly 360–384 KiB each and use the existing image cache with new URLs.

Character, counter and game-table sprites, tap targets, navigation, lighting timing and preloading/fade behavior are unchanged. Focused scene and lighting tests cover all phase URLs and waiting for background decoding before switching.

Prompting guidance attribution: Serge Shima / smixs visual-skills, CC BY 4.0, https://github.com/smixs/visual-skills.
