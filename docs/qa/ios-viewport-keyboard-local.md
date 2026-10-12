# iOS viewport and keyboard — local QA

Date: 2026-10-12. Branch: `fix/ios-viewport-keyboard`. Fresh base: `96009d251307edbc7c8d571dbc06b980bbe7daad` (`origin/dev`). Card layout changes remain in their separate branch / PR #288.

## Diagnosis and regression

The old bootstrap froze visualViewport.height in pixels at all times, did not track offsetTop / scroll / pageshow, and chat screens independently calculated their height. Document minimum height remained 100dvh. A simulated resting visual viewport 60 px shorter than the dynamic viewport left a 60 px strip; a keyboard visual viewport panned by 100 px left a 100 px gap below the shell. These are reproducible local conditions, not measurements obtained from the user's physical iPhone.

RED: 5/6 viewport tests failed on the extracted original controller. Rendered original shell: resting height 784 in a 390x844 viewport; after keyboard panning, y=0 / height=444 while the visual bottom was 544.

GREEN: closed height 844; keyboard shell y=100 / height=444; composer bottom=534, leaving only the intended 10 px gap to the simulated keyboard boundary. On resume, y=0 / height=844. Document scrolling stays at zero; the message list scrolls independently. Browser checks cover 390x844, 430x932 and 360x640.

## Implementation

CSS dynamic height is used at rest. Normal-scale visual-viewport occlusion over 120 px switches to keyboard height and top offset. Resize, visual scroll, orientation, pageshow, visibility and focus refresh the shared controller. Body scrolling is locked; routed screens own their internal scrolling. Chat and channel comments use the same viewport variables as the application shell. Keyboard chrome does not add a second home-indicator inset.

## Checks

- Focused Vitest: 66 passed across viewport, chat room, channel comments, chat chrome and login.
- Web typecheck, root ESLint and web production build: pass. Build reports its usual large-chunk and stale Browserslist warnings.
- App.test.tsx: 22 passed / 3 failed / 2 image.decode errors. The identical failures were reproduced from an unmodified archive of the exact base SHA; baseline log: /private/tmp/uh-ios-viewport-baseline-app.log.
- No full repository suite, CI or authenticated dev acceptance claimed.

## Local reproduction

Vite-only tool: `/viewport-preview.html` (port 5198 locally). It uses production CSS and the shared viewport controller, synthetic messages and simulated viewport metrics. Buttons cover keyboard opening, panning, closing and resume; it sends no application requests and does not create a login session.

Physical iPhone Safari/PWA acceptance remains pending. No deployment or merge has been performed.
