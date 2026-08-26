# Design QA — universal scoreboard and bottom navigation

## Visual sources

- Scoreboard direction: `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-7f5c28ed-ef40-4af5-9705-d6444810827c.png`
- Latest compact/transparency request: `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-354a509b-08b0-4be2-b0c0-9a29b301dd9d.png`
- Removed bonus-game transition card: `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-7608a6ef-7987-43c6-8ae8-e34af214cbb3.png`
- Bottom navigation direction: `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-d38a97c0-37e0-4833-90e9-b815694f6171.png`
- Bonus attempt result direction: `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-5c1f747b-427b-4156-9494-50323b5e6a40.png`

## Implementation captures

- Final compact transparent bonus scoreboard at 390 px: `/private/tmp/ultimate-hockey-design-qa/bonus-compact-ultra-glass-390.png`
- Final request/reference comparison: `/private/tmp/ultimate-hockey-design-qa/bonus-compact-glass-comparison.png`
- Bonus game before period start: `/private/tmp/ultimate-hockey-design-qa/bonus-idle-on-rink.png`
- Bonus player/goalkeeper entrance: `/private/tmp/ultimate-hockey-design-qa/bonus-start-entrance.png`
- Bonus game after start: `/private/tmp/ultimate-hockey-design-qa/bonus-after-start.png`
- Exit modal while the rink keeps running: `/private/tmp/ultimate-hockey-design-qa/bonus-modal-running-start.png` and `/private/tmp/ultimate-hockey-design-qa/bonus-modal-running-later.png`
- Exit modal closed without re-entry animation: `/private/tmp/ultimate-hockey-design-qa/bonus-modal-close-no-reentry.png`
- Daily game at 320/390/430 px: captures in `/private/tmp/ultimate-hockey-design-qa/`
- Training at 320/390/430 px: captures in `/private/tmp/ultimate-hockey-design-qa/`
- Duel with opponent at 320/390/430 px: `duel-with-opponent-320.png`, `duel-with-opponent-390.png`, `duel-with-opponent-430.png`
- Bottom navigation comparison: `/private/tmp/ultimate-hockey-design-qa/nav-final-comparison.png`
- Bonus result modal on the rink at 448 × 934: `/private/tmp/ultimate-hockey-design-qa/bonus-result-modal-on-rink-448x934.png`
- Normalized source/result comparison: `/private/tmp/ultimate-hockey-design-qa/bonus-result-comparison.png`
- Bonus result with ordinary-game glass at the source viewport: `/private/tmp/ultimate-hockey-design-qa/bonus-result-matched-game-glass-448x934.png`
- Final source/result glass comparison: `/private/tmp/ultimate-hockey-design-qa/bonus-result-matched-glass-comparison.png`

## Coverage

- Viewports: 320 × 844, 390 × 844, 430 × 844 and 448 × 934.
- Modes: daily game, training, bonus game and active amateur duel.
- States: live timer, break/notice, opponent status, badges, active bottom-navigation item, four- and five-column navigation, hidden navigation on game routes.
- Interactions: opening each game mode, starting a bonus period directly from the rink, player/goalkeeper entrance, opening and closing the exit modal without pausing the rink, showing a terminal bonus result over the stopped rink, keeping the result open on Escape/backdrop input, switching navigation destinations and restoring remembered routes.
- Browser console errors: none.

## Visual comparison

- Typography: labels remain uppercase and compact; tabular monospace values stay legible over bright and dark location details; long timers do not wrap.
- Spacing: the one-period scoreboard is now two rows and measures about 106 px high at a 390 px viewport. The timer stays prominent; period, goals/score and shots share one compact row.
- Colors and material: the scoreboard uses a low-opacity cold gradient (`0.18` to `0.10`) with 12 px backdrop blur, preserving the glass edge while allowing the location image to remain clearly visible.
- Image quality: location, goalie and rink assets remain unchanged and render without visible scaling regressions.
- Copy and data: existing mode labels, values, opponent data and notices are preserved. No new metric such as a streak was introduced.
- Navigation: the light glass capsule, outlined icons, dark active tile and thin diffused blue underline match the selected reference direction.
- Bonus start flow: the separate transition card is gone. The idle rink shows only the goal and `НАЧАТЬ`; the existing entrance animation brings the player and goalkeeper in from the right, then the primary action becomes `БРОСОК`.
- Bonus exit flow: the modal blocks interaction but does not suppress the active scene. During the visual check the timer advanced from `00:31` to `00:29` and the blurred player changed position; closing the modal restored the same live scene without another entrance.
- Bonus result flow: the terminal DTO no longer replaces the rink with a standalone page. The rink stays visible under the same backdrop and glass treatment as `DailyGameStatsModal`, the gameplay loop is suppressed, and the card follows the ordinary game-result hierarchy with a compact uppercase title, status, three stat cells and one dark CTA.

## Bonus result comparison details

- Source pixels: 896 × 1868 at 2× density; normalized to 448 × 934.
- Implementation pixels and CSS viewport: 448 × 934 at device scale factor 1.
- State: failed beach attempt, 2 goals from 2 shots, terminal modal open.
- Full-view evidence: `/private/tmp/ultimate-hockey-design-qa/bonus-result-matched-glass-comparison.png` places the normalized source and final rendered implementation in one image. Card width, centering, frosted material, title hierarchy and CTA proportions remain consistent; the rink behind the modal is the intentional requested change.
- Focused-region evidence: the full normalized comparison keeps the card text and controls readable, so a separate crop was not needed. The implementation adds the ordinary-game metric cells for goals, shots and accuracy without overflowing the card.
- Typography: the title, status, metric labels, tabular values and CTA use the existing ordinary-game hierarchy and remain readable at the target viewport.
- Spacing: the card is vertically centered, uses the standard 24 px radius, compact 8 px metric gaps and an 18 px action separation.
- Colors and tokens: the result backdrop now matches the ordinary daily-game result exactly: `rgba(15, 23, 42, 0.35)` with `blur(8px)`. Computed card styles are `rgba(255, 255, 255, 0.5)`, `blur(18px) saturate(1.3)`, `rgba(255, 255, 255, 0.7)` border and `0 8px 24px rgba(15, 23, 42, 0.12)` shadow.
- Image quality: the original beach rink stays full-resolution beneath the modal; no new raster assets or placeholder imagery were introduced.
- Copy: failure, completion, replay and reward copy remain driven by the authoritative attempt DTO.
- Comparison history: the initial result used the stronger shared modal backdrop. It was corrected to the `DailyGameStatsModal` transparency and blur, then re-captured at 448 × 934. The final comparison has no actionable P0/P1/P2 mismatch.

## Findings

- P0: none.
- P1: none.
- P2: none.
- P3: row content intentionally follows real game-mode data rather than reproducing mockup-only metrics; the requested single-period compact layout is implemented.

## Arena background and detached cube comparison

- Source visual truth: `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-c388df2b-0c1a-480c-aa7f-36d8d3cdc55a.png`.
- Follow-up arrow-spacing references: `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-076f4e29-2ae2-42e2-ba21-7bc0573bad5d.png` and `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-822aee54-8016-4756-9ed1-ed0e0f87111d.png`.
- Implementation screenshot: `/private/tmp/ultimate-hockey-design-qa/arena-home-final-390x844.png`.
- Full-view comparison: `/private/tmp/ultimate-hockey-design-qa/arena-home-comparison-final.png`.
- Focused arrow state: `/private/tmp/ultimate-hockey-design-qa/arena-arrows-final-390x844.png`; a separate crop was not needed because both arrows and all central copy are readable in the full-size 390 px capture.
- Viewport and density: source 884 × 1864 px normalized to 390 × 844 px; implementation 390 × 844 CSS px at device scale factor 1.
- State: authenticated arena lobby, daily-game card selected; training card was also checked after the arrow-spacing adjustment.
- Typography: live mode copy remains centered and legible. The navigation arrows no longer visually merge with multiline status text.
- Spacing and layout: the cube retains the source height and top position. The content face now reserves `clamp(38px, 11vw, 46px)` on each side, while the arrows sit 4% in from the display edges, leaving visible air both outside and inside each control.
- Colors and tokens: the grey page veil and image filters are absent; the arena image keeps its native cold contrast and the cube uses its own transparent asset.
- Image quality: the arena and cube are independent WebP assets. The cube keeps its side faces and suspension detail without a visible rectangular background.
- Copy and content: daily, training and duel content remains live application text rather than rasterized mockup copy; no gameplay state or mechanic changed.
- Primary interaction tested: previous/next tableau navigation switches cards, and the daily and training CTA states remain available.
- Browser console errors: none observed in the final visual pass.
- Comparison history: the initial implementation had a grey veil; it was removed. The arena and cube were then separated, the cube was resized and raised to the source position, and 2 px/9 px content overflow was removed. The first arrow revision moved controls away from central text; the final revision added edge breathing room while preserving the central safe area. The post-fix comparison has no actionable P0/P1/P2 mismatch.

## Arena readability audit across user sections

- User references: `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-10722ca6-b47f-4f2c-9960-4faa5e6e82af.png`, `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-dcad48ab-95ee-44b1-8b02-b7c0ddd9b25e.png`, `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-41f02905-8ca4-48ca-a511-b356070742cc.png`, and `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-9947c745-7193-4ce3-ab96-ad9d5634c7ee.png`.
- Viewport: 390 × 844 CSS px at device scale factor 1.
- Full pre-fix audit contact sheet: `/private/tmp/ultimate-hockey-section-audit/contact-sheet.png`.
- Full post-fix audit contact sheet: `/private/tmp/ultimate-hockey-section-audit/final-contact-sheet.png`.
- Captured routes: sections, amateur duels, profile, inventory, achievements, bonus games, chat list, and chat room.
- Typography: page titles and arena-level section labels now use a high-contrast cold-white foreground with a restrained dark text shadow. Labels inside light glass surfaces remain dark, avoiding an inverted-label regression.
- Cards and materials: reusable arena glass opacity increased to 0.80; section navigation cards use dedicated active/default/muted opacity levels, and the empty current-duels state is now a glass card instead of loose low-contrast text.
- Chat: chat routes receive a separate pale ice wash over the arena image. It lowers background detail without grey dimming and leaves bubbles, headers, dates, and the composer above the wash.
- Image quality: the arena source image is unchanged; only app-owned overlay and surface opacity changed.
- Copy and content: no text, data, navigation, or game mechanics changed.
- Primary interactions checked: section navigation hierarchy, duel tabs/search controls, shop tabs, achievement filters, bonus-game CTA states, chat list, and chat room composer.
- Browser console errors: none.
- Accessibility limit: screenshots support the visible contrast assessment, but do not replace automated color-contrast measurement or screen-reader testing.
- Comparison history: initial captures showed dark page titles disappearing into the arena ceiling and 0.50 glass allowing bright lamps through section cards. After the first pass, section headings and cards were readable, but top-level shop, achievements, and bonus-game titles still blended into the ceiling. The second pass applied the shared arena title style to those routes and added a dedicated pale chat treatment. The final contact sheet has no actionable P0/P1/P2 readability issue.

## Chat-list header simplification

- User references: `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-7f9f44eb-2b89-4984-ace1-881cd73e4b28.png` and `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-e2e8aa65-053b-4aff-b2de-3b1c90ffffc2.png`.
- Implementation screenshot: `/private/tmp/ultimate-hockey-design-qa/chat-list-header-separated-2026-08-24.png`.
- State: authenticated chat list with the system-news channel and a direct message visible.
- Layering: the redundant outer glass capsule is removed; search and the circular create action remain independent controls on the arena background.
- Spacing: the detached header reserves 12 px below its controls, preventing the first chat card from sticking to the search field.
- Typography: the search placeholder uses a darker secondary ink at full opacity and remains clearly subordinate to entered text.
- Functionality: search, create-chat action, chat cards and bottom navigation remain unchanged.
- Browser check: the final mobile render has no actionable P0/P1/P2 mismatch.

final result: passed

## Bonus catalog repeat action and demo gameplay navigation

- Source visual truth for the repeat action: `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-a25ddbcc-33d5-4781-a3cf-06c3ffb008c7.png`.
- Source visual truth for the demo gameplay shell: `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-1036ea92-3c64-4f6a-bf13-62ac7d411543.png`.
- Final demo screenshot: `/private/tmp/bonus-demo-no-bottom-nav.png`.
- Repeat action: the completed-game modifier is applied after the generic disabled CTA rule and keeps a solid `#0f172a` background with opacity `1`, including when another skill owns the active attempt. The focused regression reproduced the former computed `rgba(15, 23, 42, 0.35)` and now asserts `rgb(15, 23, 42)`.
- Demo gameplay: `/demo` is treated as an open rink route for global navigation visibility. The final DOM contains only the rink scoreboard and scene controls; the four-tab bottom dock is absent. The home, shot and sound controls inside the rink remain unchanged.
- Findings: P0 none; P1 none; P2 none.

final result: passed

## Bonus qualification catalog refinement

- Source visual truth: `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-0e9237be-31b1-490d-8269-2eb423cce70a.png`, `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-a6ee122d-f782-4539-a2e5-a6d6faabb5f7.png`, `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-19511d10-04e4-4f57-94af-a24f3e90812f.png`, `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-0d21e137-749f-4115-9626-4d1e33252daf.png`, and `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-39bff7f0-fc6e-41b0-936c-e5693025fa53.png`.
- Implementation screenshots for `Скорость`: `/private/tmp/bonus-speed-cards-320-fresh.png`, `/private/tmp/bonus-speed-cards-390-fresh.png`, and `/private/tmp/bonus-speed-cards-430-fresh.png`.
- Implementation screenshots for `Точность`: `/private/tmp/bonus-accuracy-cards-320-viewport.png`, `/private/tmp/bonus-accuracy-cards-390.png`, and `/private/tmp/bonus-accuracy-cards-430.png`.
- Full-view comparison evidence: `/private/tmp/bonus-design-comparison.png`; focused compact-card comparison: `/private/tmp/bonus-compact-comparison.png`.
- Viewports and density: 320 × 760, 390 × 844, and 430 × 900 CSS px at device scale factor 1. The 892 × 1278 source was normalized to 390 × 559 for the comparison; the implementation was cropped to the same 390 × 559 visible region.
- State: authenticated bonus-game catalog with a `Точность` attempt active; both `Скорость` and `Точность` were selected and captured independently with the first qualification card visible.
- Typography: the featured card keeps its original hierarchy. Compact cards use a 13 px two-line title, 9.5 px three-line rules and an 11 px action so long location names and conditions fit beside the artwork. `Дальше` and `Пройденные · N` reuse the same 10 px, weight-600 uppercase `section-label` as the main Sections hub.
- Spacing and layout: the featured artwork is restored to its original full-width 154 px crop. Compact cards use 124 × 124 px square artwork with a 10 px inset inside a 144 px-tall card. Completed games are always visible rather than wrapped in a disclosure. Every compact card uses the same five rows for number, title, rules, rewards and action; the hidden completed-game reward keeps its row, so the remaining content does not move. Browser measurements at 320, 390 and 430 px matched for the completed and locked cards: artwork/eyebrow `11 px`, title `24 px`, rules `55 px`, action `107 px` from the card top. The document had no horizontal overflow at any checked width.
- Colors and tokens: skill switching now reuses the exact `SegmentedTabs` component and active/inactive materials from the shop instead of a bonus-specific chip treatment.
- Image quality: cards use the authoritative arena thumbnail rather than the preview illustration. The featured card retains the wide upper-location crop; compact cards square-crop the clean arena at the top, with no goalkeeper in the image. No placeholder or CSS-drawn imagery was introduced.
- Copy and content: the separate active-attempt notice and `Вернуться в игру` action are removed. Completed cards use one subtle 20 × 20 px glass check in the top-right corner of the whole card, with the accessible label `Игра пройдена` and no visible status text. `Повторить` keeps the dark CTA material even when the global single-attempt rule temporarily blocks it; the disabled state remains semantic and server-enforced. Qualification rules and reward values remain unchanged.
- Primary interactions tested: switching between `Скорость` and `Точность`, persistence of the selected skill, focus of an active attempt inside its own skill, and disabled start actions while another attempt exists. At every viewport `document.documentElement.scrollWidth` matched `window.innerWidth`, so neither skill introduced horizontal overflow.
- Browser console errors: none (`tab.dev.logs`, error level, returned an empty list after the fresh six-capture responsive and tab-switch matrix).
- Focused-region evidence: `/private/tmp/bonus-compact-comparison.png` compares the supplied oversized-goalkeeper card directly with the final 390 px compact card. The final artwork is larger relative to the card, clean of the goalkeeper, and aligned to equal 10 px top/bottom/left insets.
- Comparison history: the first square-card pass used the preview illustration, left the artwork much shorter than the card and introduced an oversized goalkeeper. The final pass restores the wide featured crop, uses clean arena artwork for list cards, reduces compact typography and action height, and re-captures all three widths. No actionable P0/P1/P2 mismatch remains.
- Findings: P0 none; P1 none; P2 none. P3: at 320 px the longest qualification copy wraps to three compact lines, but the title, condition and action remain readable without overflow.

final result: passed

## Gameplay backdrop, loading contrast, and bonus break modal

- Source visual truth: `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-534ce34f-ed13-4d0a-ba10-d3c7777ca2df.png`, `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-27cea9a2-034b-4e6d-a81e-dddafd477701.png`, and `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-8e637077-95bf-436b-b1fd-3a0e4f0123d7.png`.
- Implementation screenshots: `/private/tmp/hockey-ui-qa/daily-390x844.png`, `/private/tmp/hockey-ui-qa/daily-430x932.png`, `/private/tmp/hockey-ui-qa/bonus-break-390x844.png`, and `/private/tmp/hockey-ui-qa/bonus-break-430x932-final.png`.
- Full-view comparisons: `/private/tmp/hockey-ui-qa/daily-comparison.png` and `/private/tmp/hockey-ui-qa/bonus-break-comparison-final.png`.
- Viewports and density: 390 × 844 and 430 × 932 CSS px at device scale factor 1. The supplied Android screenshots include system chrome and were proportionally normalized to 430 × 932 for comparison; system status bars were excluded from fidelity findings.
- State: authenticated daily-game idle rink and a synthetic local bonus attempt in `break_active`. The synthetic attempt was removed from the local dev database immediately after capture.
- Typography: the bonus title, explanatory copy, and tabular timer follow the standard modal hierarchy. Both route-level and daily-state loading messages now share a 14 px, weight-800 cold-white treatment rather than the low-contrast muted token.
- Spacing and layout: the daily rink remains centered at both mobile sizes without the outer stadium image. The bonus break card stays centered, capped at 340 px, and does not overflow either viewport.
- Colors and tokens: ordinary gameplay uses the base ice gradient only; `app-shell--arena` is absent for `/?view=daily`. Loading uses a translucent dark pill with a white border and text shadow. The break reuses the standard frosted modal backdrop and card tokens.
- Image quality: no rink, arena, goalkeeper, or gameplay asset changed. The bonus rink remains visible at full quality beneath the modal blur.
- Copy and content: the existing server-authoritative break copy and countdown are unchanged. No gameplay timing, simulation, inventory, or API contract changed.
- Primary interactions tested: entering daily gameplay from the arena, loading an authoritative bonus break, automatic countdown rendering, and background interaction suppression while the modal is open.
- Browser console errors: none at either rendered state.
- Focused-region evidence: the full 430 px break comparison keeps all modal typography, border, spacing, and timer details readable, so a separate crop was not needed.
- Comparison history: the first bonus capture exposed the browser's default blue focus outline on the programmatically focused non-dismissible dialog. The final implementation replaces it with a component-scoped 3 px white `:focus-visible` outline, preserving a deliberate keyboard-focus indicator that matches the glass edge. The saved comparison predates this accessibility follow-up and therefore documents the modal layout, not the final focus-ring color.
- Loading capture note: the local API resolves too quickly to retain the loading frame for a stable browser screenshot. The rendered-state regression verifies the accessible `status` element and shared high-contrast class in both loading paths; the visible token values are deterministic CSS shared with the browser-checked app shell.
- Findings: P0 none; P1 none; P2 none. P3: the final bonus modal intentionally reveals the stopped themed rink through blur rather than replacing it with a flat background, because the requested behavior is a modal over the current bonus game.

final result: passed

## Login rink redesign and compact brand header

- Source visual truth: `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-9de2a0fe-ba88-45de-995b-637d1394f628.png` (874 × 1860 px).
- Follow-up header target: `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-cc96ff91-b217-429d-8408-9e3b795520e9.png` (890 × 526 px).
- Implementation screenshot: `/private/tmp/login-preview-430x932-final.png` (430 × 932 px).
- Full-view comparison: `/private/tmp/login-reference-vs-implementation-final.png`.
- Focused header comparison: `/private/tmp/login-header-adjustment-comparison.png`; this crop keeps the logo, title, slogan, benefit pills and rink safety-net cable readable at once.
- Viewport and density: implementation 430 × 932 CSS px at device scale factor 1. The 874 × 1860 source was normalized to 438 × 932 for the full-view comparison. A second responsive check used 390 × 844 CSS px at device scale factor 1.
- State: unauthenticated `/login`, Telegram widget unavailable in the local environment, VK, demo and Dev actions visible.
- Typography: the app name `Ультимейт Хоккей` is a distinct heading below the logo; the slogan and four compact benefit labels preserve the requested hierarchy and remain light over the night rink.
- Spacing and layout: the final logo is 96 × 96 px at both checked viewports. At 430 × 932, benefit pills end at y=213.3 px, above the visible top cable of the rink safety net. At 390 × 844, they end at y=207.6 px. The auth actions and terms remain inside the viewport with no document overflow.
- Colors and tokens: all app-owned login copy uses high-contrast white or cold-white foregrounds with restrained dark text shadows; the equal-width auth controls retain their existing product colors and 999 px pill radius.
- Image quality: the generated 857 × 1835 WebP rink artwork remains the only full-screen raster background. No placeholder, CSS drawing or rasterized UI text was introduced.
- Copy and content: the screen includes the app name, `Живи жизнью профессионального хоккеиста`, `тренировки`, `игры`, `соревнования`, `призы`, the three available auth actions and the terms copy. The Telegram VPN fallback remains explicitly split into two lines by component markup.
- Primary interactions checked: all login/demo buttons are present and enabled in the local state; the existing auth handlers were not changed by the visual adjustment.
- Browser console errors: none observed during a fresh reload.
- Comparison history: the first implementation used a 116 px logo and placed the benefit pills at y=211–233 px, visually colliding with the safety-net cable in the user's follow-up screenshot. The logo clamp was reduced to 76–96 px; the post-fix pills end at y=213.3 px and the focused comparison shows clear separation above the cable. No actionable P0/P1/P2 finding remains.

final result: passed
