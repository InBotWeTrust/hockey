# Approved bar emotions

Six states for Maria, Daria, Grigory, Arsenich, Veronika, Oleg and Igor:
neutral, joy, interest, surprise, empathy, displeasure. Timofey uses the existing
composition because no approved emotional artwork was provided.

Sources: `artifacts/character-emotions-ready-2026-10-12` for six characters;
`artifacts/maria-best-candidates-2026-10-12` for all six Maria images.
Original PNGs remain untouched. WebP conversion preserves proportions and
transparency in a common 1024×1536 canvas. Maria's colored fringe is retained;
no matting, recoloring or retouching was performed. Source checksums are listed
in `manifest.json`.

Prepare from repository root:
`pnpm --filter @hockey/web exec node scripts/prepare-bar-emotions.mjs <common-folder> <maria-folder>`.
