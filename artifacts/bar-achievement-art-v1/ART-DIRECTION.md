# Bar achievement artwork v1

A cohesive family of cinematic realistic object stills for Ultimate Hockey's sports bar. Dark navy ambience, warm amber practical lights, gold rim highlights, legible silhouettes. Match existing realistic achievement artwork; avoid UI frames, typography, mascot trophies or copied portraits for game feats.

45 generated object scenes; nine existing approved character portraits for meeting achievements. One artwork per numbered achievement, shared between character/online variants and all levels. Text, numbers and locked-state icons stay in code.

Runtime: 640x640 WebP detail, 160x160 WebP list thumbnail. Budgets 100000 / 14000 bytes. List images remain lazy, detail image loads on opening. Filename suffix -v1 gives a fresh URL for image caching. Existing PWA CacheFirst image route (500 entries, 30 days) handles these images; do not preload all artwork at startup.

Generation uses the built-in image_gen tool. The first reference is the darts-180 scene; subsequent subjects preserve its lighting/material quality. User delegated asset creation with 'делай'. Generation prompts, provenance, source copies, output hashes and sizes are recorded in manifest.json. Original generated images are copied into sources without deleting the tool originals.

This is local preview work. No deployment or live-account changes.
