# Dev-only marksmanship situation constructor

## Intent and scope

Players on the development environment need a visual tool to investigate why a marksmanship shot receives a particular technique and point value. The tool must use the game's perspective court, artwork, geometry, timing and classification rather than the independent approximations in `marksmanship-sandbox.html`. It is reached by tapping the profile avatar and has a Back button returning to the profile. The page must never be available in a production build. Grip selection is deliberately out of scope.

The existing standalone HTML remains an explicitly labelled educational approximation. This change does not alter gameplay, scoring rules, persisted attempts, or the production profile.

## Access and release boundary

The constructor is a separate authenticated client route, for example `/profile/marksmanship-constructor`, available to players only in a development build. The profile avatar is an accessible button linking to that route only when the dev-only feature gate is enabled. The route itself uses the same gate and falls back to the normal unavailable/not-found handling when disabled, including on direct navigation. The constructor has a visible Back button to `/profile`.

The gate is **disabled by default** and enabled explicitly by the dev build configuration; a source comment documents its purpose but is not relied on as protection. A production-build check must verify that neither the avatar action nor the route is reachable and that constructor-only code/assets are absent from the emitted production bundle. If the current build pipeline cannot prove that exclusion, deployment to dev waits until a separate entry/build boundary provides it. No server endpoint or stored constructor state is required.

## Interaction model

The screen has a court and a compact explanation panel, with phone layout stacking the panel beneath the court. The court keeps the game's aspect ratio and transforms so that visible positions, puck flight and hitboxes line up with gameplay at any viewport size. Controls and numeric input remain usable on touch screens.

Two clearly labelled modes share the court and measurement display:

1. **Game attempt.** The user supplies or selects the same seed, shot index, goalie configuration, phase offsets and timing parameters used by a game attempt. Playback can be paused or scrubbed, and the user chooses the shot moment. The view shows the player, goal and goalie at that moment, the puck's flight and the resulting goal/save/miss. Technique and points are calculated with the same game-core functions and scoring version/rules as that attempt. The panel explains the selected technique, other satisfied techniques and relevant geometry/timing measurements. A saved attempt is not silently inferred from a single screenshot; if complete inputs are unavailable the screen says which inputs are missing.
2. **Manual positioning.** The user may drag objects or enter legal center coordinates. Goal and goalie fields explicitly say they are hitbox centers and show their left/right bounds; the player field shows the shot-line X. Position limits keep hitboxes on the court. The page labels this mode `Ручная расстановка`. It reports static geometry and what a shot through those positions would intersect. A V4 technique or authoritative point value is **not** asserted from positions alone, because several techniques depend on movement, previous position and shot timing. Where required dynamic inputs exist, those are shown and used; otherwise the panel states `Недостаточно данных для категории` rather than inventing a result.

Switching modes does not silently reinterpret manual coordinates as a real attempt. Reset restores the game's initial arrangement and defaults, not the old HTML's arbitrary shot-15 setup. No constructor action creates or submits a bonus-game attempt.

## Architecture and data flow

The new screen reuses the game's court assets, coordinate transforms and entity renderers through a small controlled-scene interface extracted from `PlayView` where necessary. `PlayView` remains the live game owner of its clock and input; the constructor owns a deterministic, pausable clock and passes a scene state into the shared rendering boundary. Shared code contains no constructor-specific labels or routing.

Game-core remains the single source for simulated positions, shot resolution, marksmanship measurements and V4 classification. A pure constructor adapter takes explicit attempt inputs and a shot time, produces a display snapshot and calls the same exported game-core functions used by the server. If a classification needs series history or a scoring-rule snapshot, the adapter requires those inputs and identifies their absence. It must not maintain a fork of the scoring thresholds in web code.

For manual mode, a separate pure geometry projection maps entered center coordinates to hitbox bounds and intersection information. It uses the shared dimensions/transforms; it does not masquerade as the deterministic time-based simulator. Both modes expose the source and time of each measurement in the panel (tap, goalie-crossing, goal-crossing), because those positions may differ.

The screen stores only transient client state. Invalid or out-of-range numbers are rejected or clamped with visible feedback; incomplete attempt parameters keep the result in an `insufficient data` state. Rendering and calculation errors do not submit shots or modify profile/bonus-game data.

## Verification and acceptance

- Pure tests compare constructor snapshots and classifications against the existing game-core/server path for representative ordinary, near-goalie, board-side, counter-direction, precise, behind-goalie and super-precise cases, plus goal/save/miss and boundary positions.
- Regression tests verify that live `PlayView` behaviour and bonus-game scoring remain unchanged.
- Route tests cover avatar entry, Back navigation, direct URL denial with the feature gate off, and keyboard/touch accessibility.
- Production-build verification proves constructor route and constructor-only assets are excluded; dev-build verification proves they are present.
- Browser acceptance on dev-sized desktop and phone viewports confirms the rendered court, hitbox overlay and output at the same time/seed as a known attempt. These checks are distinct from unit tests and from deployment provenance.

## Out of scope

No grip control, production exposure, server writes, scoring rebalance, or guarantee that the old single-file HTML exactly matches gameplay. A downloadable offline version is a separate packaging project; this design delivers a dev page accessible by URL.
