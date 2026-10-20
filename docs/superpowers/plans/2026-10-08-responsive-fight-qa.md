# Responsive fight release validation

Local release scope: v3 held controls, five HP, twenty-second main phase, shared three-contact guard reserve, crouch dodge, interrupted attacks, expanded movement and contact knockback. Legacy saved rules continue through the v1/v2 engine and view.

Validation: 51 game-core fight tests, 39 client fight/socket tests, 7 command/progression/virtual-latency tests, and 25 isolated PostgreSQL/Redis integration cases passed. Monorepo typecheck, lint, and web/server builds passed. Full core run exposed four pre-existing stale open-window bank cases (bank78 versus baseline core79); the extra legacy-duration fixture failure was corrected and all fight tests passed again.

Browser: local art QA at normal viewport and 360px; mirrored player identity, heart/shield indicators, held controls, hit reaction and shield loss inspected. This is not live two-player network acceptance. Latency tests use virtual time with real server admission and mocked storage, not device measurements.

Art: crouch-atlas-v1.webp contains crouch, head-covering crouch guard, and low strike. Built-in image generation used the existing red/blue hockey player sheet as reference; the guard edit raised bare forearms over the head without helmet/gloves. Transparent pixels and white-background compositing checked. No blur/shadows.

Dev preflight: origin/dev ca865ffe matched branch base. No running fights or active version79 training sessions found in dev; retained training rows were already version68/76/69. No database cleanup performed. Version80 is preserved.

Independent review was not dispatched; repository user instructions prohibit delegation. Final review performed inline. Actual two-player dev acceptance remains open.
