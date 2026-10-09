# Second-series artwork

Built-in image_gen used. Original approved beginner illustrations lock style and identity: scene-04-mentor.webp, scene-07-name.webp and scene-09-arena.webp. See assets.json for exact generation outputs, 941x1672 geometry, WebP byte sizes and cache hashes. Every final frame inspected for drawn style, identity, clothes, perspective, hands and background continuity. Encoding: quality 82, effort 6; no resize/crop/stretch.

Six pairs: greeting head turn; memory glance to ice; introduction/direct camera gaze and handshake; professional arena absent/present; amateur stadium relaxed/pointing arm; invitation looking at player/turned toward entrance. Pair 04 reuses the approved first-series arena images; frame02a reuses its approved portrait. They are saved under second-series filenames so future versions remain independent.

Prompt rules for all outputs: one portrait image exactly941x1672; clean drawn videogame illustration with simplified skin/cloth shadows, never photo textures; same recognizable gray-stubbled man, black knit hat/gloves, olive coat; same navy-clothed player and winter blue/warm light palette; no text or watermark. Pair variants change only specified head/arm gesture and preserve composition and environment.

User corrections:
- Initial handshake looking aside rejected. New pair generated from original portrait with direct eye contact, then handshake arm only. Rejected output exec-67a372d3-b157-4316-ab0c-829b0791fd07.png is not used.
- Initial amateur stadium had central mesh panel blocking entrance. Base and derived frames rejected. New stadium generated from original approved arena/portrait references with two opened gate leaves attached to side posts, clear central passage, perimeter fences only and red hockey goal at far end. No rejected image used as regeneration input.
- Invitation candidate still showed face rather than turning to entrance. Regenerated from accepted stadium base; final back/head and inviting palm gesture.

Public assets: packages/web/public/onboarding/amateur/. Narrative and precise text cues: packages/web/src/onboarding/amateurStory.ts. Deployment not authorized for this task.

- Pointing stadium frame rejected for elongated arm. Regenerated from accepted scene-05-a only, with bent elbow close to torso and proportional glove; original rejected frame was not used as input.

- 2026-10-09: both stadium frames rejected for identity drift and arm proportions. New base generated exclusively from approved original mentor portrait and arena references. New gesture derived only from the new inspected base: mature gray-stubbled profile, compact bent elbow and open palm. Previous rejected pair not used as input.
