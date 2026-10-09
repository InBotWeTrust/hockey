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

- 2026-10-09 follow-up: player authority is `/Users/egorgumenyuk/Downloads/Игрок сетка.png`: mature adult, brown stubble, strong jaw and athletic build. Youthful stadium candidates were rejected. New scene05 pair preserves this adult identity and uses a close side view. Scene04 adds a left-hand shoulder pat. Scene06 has three frames: closed side-board wicket, open rigid wicket, adult player stepping onto ice with the full stick visible. Rejected gate candidates had twisted geometry, cropped/shortened sticks, a goal opposite the entrance, landscape format, or a second near board; none are installed. Final scene06 base was generated from the original character references, without rejected candidates as inputs. All installed assets retain 941x1672 dimensions and WebP quality82/effort6 with updated cache hashes.

Local verification: third-frame asset tests observed RED (two missing assets), then GREEN after installation. 63 targeted flow/integration/beginner/cache/asset tests pass. Web build includes passing TypeScript check; scoped ESLint and diff check pass. Local React preview reviewed at default width, 390x844 and 320x568; player dialogue is white, mentor blue; final scene begins with closed wicket and ends with player entering. No deployment or account-state mutation performed.

## Garage gifts and indoor amateur rink

The series now has nine scenes. After the professional-arena memory, three new paired scenes show the Logan ride and garage arrival (07), folded red-blue-white uniform and red helmet handed to the player (08), then packaged equipment offered on the workbench (09). The skates remain in a closed box, the stick is paper-wrapped and the energy cans have plain sleeves with no model or brand. These images do not depend on shop product artwork.

Scenes 05 and 06 replace the outdoor courtyard with a modest indoor rink: roof trusses, small spectator stands, glass boards and players in hockey uniforms. The mature player uses the approved red-blue-white uniform and red helmet from ultimate-player-left.webp; identity comes from the adult player reference sheet. The last scene has three frames with the same rigid sideboard wicket: closed, open, then player stepping through; Arsenich remains outside the rink.

All new frames are generated with the built-in image tool, inspected and encoded as 941x1672 WebP at quality 82 / effort 6 without resizing or cropping. Content hashes in storyImageVersions.ts invalidate old browser/service-worker assets. Current and next scene images are prepared and decoded before navigation; the entire series is not eagerly loaded.

Gift issuance audit: the inspected checkout contains a currency reward for amateur-ticket and historical one-off inventory grant operations. Automatic inventory issuance at promotion was not established. This change adds narrative/artwork only and does not add or alter backend grants. Actual account promotion and gift issuance remain outside the local preview verification.
