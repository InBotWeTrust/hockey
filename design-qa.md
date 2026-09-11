# Design QA — календарь турнира в админке

## Evidence

- User references:
  - `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-555b73e6-9ef2-4015-9993-b9a5d1c1a44e.png`
  - `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-344753e7-eb8a-4812-93b8-dcfd18e828df.png`
  - `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-38f3175e-2599-4201-bdd7-76e1dd9029b8.png`
  - `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-2414ca75-62c5-4793-a7d7-da633612be64.png`
- Browser-rendered implementation: `admin-calendar-final.png`.
- Local URL: `http://127.0.0.1:5179/admin`.
- State: local Classic tournament with playoff fixtures, including known, conditional, unresolved, paused, and inconsistent legacy fixture states.

## Verified behavior

- The admin schedule uses the same month calendar structure as the player tournament page.
- Selecting a date renders every game for that date directly below the calendar.
- Long vertical sections for matchdays and the separate `Следующие игры` disclosure are absent.
- Playoff days are visually distinct and remain clickable only inside the tournament date range.
- A conditional fixture with known players reads `Если серия продолжится`.
- A fixture without a formed pair reads `Ожидает определения пары`, even if inconsistent legacy data reports it as active; the card does not show a false live state or `0:0` score.
- Unresolved championship fixtures are labelled as playoff rounds; the third-place series reads `Плей-офф · матч за 3-е место`.
- The admin playoff bracket reuses the player-facing round tabs and series cards: both players have equal visual weight, avatars and seeds are visible, and each series contains its game list.
- The selected round shows its duel format; future participants are explained through the source series instead of an ambiguous status.
- Round tabs, round heading, format label, and the first series now use the same compact 8px vertical rhythm in both admin and player views.
- The existing `Решить серию вручную` action remains available inside the corresponding unfinished series card.
- The approved-participant badge is shortened to `Заявка подтверждена`, preventing the tournament-card layout from stretching.
- Browser console errors: none.

## Findings

No actionable P0, P1, or P2 visual differences remain for the requested admin calendar flow.

final result: passed

# Design QA — узкие экраны 323–360 px

## Evidence

- Source visual truth:
  - `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-de2917bf-ae03-46d0-9e13-c9e659ae919d.png` — главная, 323 CSS px.
  - `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-772dc373-a8d3-49a1-969c-9ad9a706c75e.png` — магазин, узкий мобильный экран.
  - `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-2d713c28-194f-4d0f-b79d-baffd9868191.png` — турнирная сетка, 323 CSS px.
- Browser-rendered implementation: live in-app Browser captures from `http://127.0.0.1:5183` at 323 × 700, 340 × 700, and 360 × 740 CSS px; deviceScaleFactor 1. The browser capture API did not expose persistent screenshot paths.
- State: authenticated local player; Sections screen, populated Inventory shop, and a 32-player playoff overview with two visible rounds.
- Source pixel dimensions include surrounding DevTools chrome and therefore were normalized by comparing the 323 px application content region. Implementation captures used an explicit 323/340/360 px viewport at density 1.

## Full-view comparison

At 323 px the two compact quick-access cards remain in one row and `Тренировка` is fully visible on one line. The shop now uses two product columns, with complete item names, quantities, prices, and CTA text. The tournament keeps two rounds visible, clips no player row, and exposes the next upper tab as a horizontal-scroll affordance. At 340 and 360 px the same structure remains stable without breakpoint jumps.

## Focused comparison

Focused browser measurements confirmed that the quick cards are 142.5 px wide at the narrowest viewport and that their image/text tracks remain inside those bounds. The playoff viewport is 310 px wide at 360 px while its wider grid remains intentionally contained by the horizontal scroller; player rows stay inside their round columns. A separate focused check found and fixed the shop balance pill accidentally inheriting product-card height before the final capture.

## Required fidelity surfaces

- Fonts and typography: compact quick-card titles stay on one line with an ellipsis fallback; product names retain two readable lines; bracket names truncate without displacing seeds or series scores.
- Spacing and layout rhythm: compact cards use smaller art, padding, and gaps only up to 360 px; shop cards use an even two-column rhythm; the bracket has an 8 px column gap and safe bottom reserve.
- Colors and visual tokens: all existing glass, ink, muted, CTA, and tournament state tokens are unchanged.
- Image quality and asset fidelity: original section and inventory WebP artwork is preserved without stretching; object-fit behavior is unchanged.
- Copy and content: no labels were removed or rewritten; only responsive layout changed.

## Interaction and console checks

- Opened Sections, Inventory, the tournament details, and the playoff tab at 323 px.
- Switched the tournament details from Overview to Playoffs and verified both horizontal tab strips.
- Repeated the playoff view at 340 and 360 px.
- Browser console warnings/errors checked after the flow: none.

## Comparison history

1. P1: `Тренировка` left its compact card in the 323 px source. Fixed by reducing the compact image/spacing and fitting the title on one line; post-fix capture shows the full word inside the card.
2. P1: the shop forced three unreadable product columns. Fixed with a two-column narrow grid and compact product sizing; post-fix capture shows complete names, quantities, prices, and buttons.
3. P1: playoff player rows overlapped narrow columns. Fixed with narrower bracket gaps, padding, avatars/text tracks, and contained horizontal scrolling; post-fix captures at 323/340/360 px show no overlap.
4. P2: the shop header title and balance pill competed for width; an intermediate class placement also stretched the balance pill vertically. Fixed by scoping product-card classes correctly and compacting only the header at 360 px and below.

## Findings

No actionable P0, P1, or P2 responsive differences remain in the three requested screens. Horizontal overflow in both tournament tab strips and the bracket grid is intentional and contained by their own scrollers.

final result: passed

---

# Design QA — история любительских дуэлей

## Evidence

- Source visual truth:
  - `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-2508dd38-b8ed-4b89-9a68-9746e3c1f51a.png`
  - `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-fd3e1633-f29c-48c2-b8fd-a94b66011ee7.png`
- Browser-rendered implementation:
  - `output/duel-history-final.png`
  - `output/duel-history-ordered.png`
  - `output/duel-history-day-modal.png`
- Combined focused comparison: `output/duel-history-comparison.png`
- Browser viewport: 1280 × 720 CSS px, deviceScaleFactor 1; application column is 430 CSS px wide.
- Source pixels: 832 × 1200 and 834 × 892. Calendar reference was normalized to 421 × 449 for focused comparison.
- Implementation pixels: 1280 × 720. Calendar region was cropped to 404 × 400 for focused comparison.
- State: August 2026, synthetic QA user, four ordinary played days and one day containing five completed duels.

## Full-view comparison

The implementation now follows the approved hierarchy: section label, lifetime summary, selected-month summary, then the calendar with arrow navigation. The select dropdown and the old saturated calendar palette are absent. The fixed bottom navigation remains visible and does not overlap interactive calendar days at the tested viewport.

## Focused comparison

The side-by-side calendar comparison confirms matching card radius, weekday row, seven-column geometry, month-title hierarchy, square day cells, and left-arrow treatment. The blue played-day surface and result dots are intentional product changes requested after the source capture: blue denotes an activity day without implying victory; green, red, and yellow dots encode win, loss, and draw in chronological order.

## Required fidelity surfaces

- Fonts and typography: section label uses the shared `section-label` style; month and summary headings reuse the daily-history weights and hierarchy; long modal rows truncate safely.
- Spacing and layout rhythm: 8px section rhythm is preserved; summary and calendar use 14px card padding and 22px radius; the day modal now has a 14px internal gap.
- Colors and tokens: summary reuses the daily blue glass gradient; played days use the tournament participation blue; semantic result dots are muted green, red, and yellow.
- Image quality and assets: no new raster assets were introduced; existing arena artwork remains sharp and unchanged; Lucide chevrons match the established icon system.
- Copy and content: month dropdown was replaced with arrows; legend reads `Игровой день / Победа / Поражение / Ничья`; day modal uses the concrete date form `Дуэли за 25 августа`.

## Interaction checks

- Previous and next month arrows update both the calendar and selected-month summary.
- A day with five duels shows count `5` and ordered result dots `loss, win, loss, win, win`.
- Clicking the day opens the five-match list.
- Clicking a match opens the existing period-by-period result modal.
- Browser console errors checked: none; only the existing React Router v7 future-flag warnings remain.

## Comparison history

1. P1: duel history used an unrelated summary, dropdown month selector, and a different calendar language. Fixed by reusing the daily-history structure and arrow navigation.
2. P2: green day fill implied that every played day was a victory. Fixed with the tournament participation-blue surface and a neutral `Игровой день` legend.
3. P2: activity density and outcomes were invisible. Fixed with a top-right duel count and chronological win/loss/draw dots.
4. P2: the day-list title sat too close to the content and used `за 25 число`. Fixed with a 14px modal gap and localized month copy.
5. P2: the selected-month summary appeared below the calendar. Fixed by placing it directly after the lifetime summary and leaving the calendar last.

## Findings

No actionable P0, P1, or P2 differences remain for the requested state. The implementation intentionally contains more semantic information than the original daily calendar reference.

## Follow-up polish

No blocking follow-up. A future pass may test five-dot readability under OS-level text enlargement without changing the current compact layout.

final result: passed

---

# Design QA — контраст формы новой дуэли

## Evidence

- Source visual truth:
  - `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-65bc48a8-d203-434d-8a78-b95ddd4db83e.png`
  - `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-d47257a4-8c87-476a-a303-8d33dd30fdcd.png`
- Local implementation URL: `http://127.0.0.1:5175/?view=amateur&section=duels&from=sections`.
- Browser-rendered implementation screenshot: unavailable because the in-app browser opened the unauthenticated login state.

## Implemented surfaces

- Formats, duel-template dropdown, quick opponent selection, and opponent search use the same opaque light surface.
- Text and icons inside those surfaces use dark high-contrast colors.
- The disabled challenge CTA keeps a dark surface with readable light text.
- The empty current-duel copy has balanced vertical spacing without a container or icon.

## Verification

- Focused duel UI tests pass.
- Full web test suite passes.
- Repository typecheck, lint, and production build pass.
- Auth state was not changed during QA.

final result: blocked — authenticated browser state is required for a rendered screenshot of this specific screen.

---

# Design QA — рейтинг любительских дуэлей

## Evidence

- Source visual truth: tournament standings plus the daily-calendar month header in `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-649f0ee8-859a-4f88-a884-5eb55ba5f0dd.png`.
- Browser-rendered implementation: `output/duel-rating-final.png`.
- Combined comparison: `output/duel-rating-calendar-comparison.png`.
- State: August 2026, five synthetic QA players, current player on the second row.

## Comparison

The duel rating uses the shared tournament standings component with a duel-only compact modifier. The month switcher is now the same arrow-based header used by the daily calendar and lives inside the table card rather than in a separate dropdown card.

The seven columns fit as `М / Игрок / И / В / Н / П / О`. Rank, record, and points columns have fixed compact widths; the player column receives the remaining space, uses a 24px avatar and truncates long names. The current-player row has a quiet blue fill with no dark block, accent stripe, or rounded-row treatment.

## Interaction checks

- Previous and next month arrows use the available rating seasons and retain the daily-calendar disabled behavior.
- The month header and table are inside one shared glass card.
- Long player names truncate inside the player column without shifting the numeric columns.
- Clicking a player row still opens the existing profile action.
- `320px` browser QA reports no body, card, table, or locker horizontal overflow.
- Browser console errors checked: none; only the existing React Router v7 future-flag warnings remain.

## Findings

No actionable P0, P1, or P2 differences remain for the requested table treatment.

final result: passed

---

# Design QA — раздевалка дуэлей

## Evidence

- Source: `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-ad1934c3-a704-4451-8060-317ee4b2d13b.png`.
- Browser-rendered implementation: `output/duel-locker-final.png`.
- Combined comparison: `output/duel-locker-comparison.png`.

## Comparison

The three inventory slots are now equal horizontal cards in one column: square artwork on the left, item name and stock state on the right. The order remains skates, stick, nutrition; the existing item picker and shop CTA are unchanged. The horizontal structure preserves larger readable artwork while avoiding the narrow wrapped labels produced by the former three-column grid.

## Interaction checks

- Each complete card remains a minimum-44px interactive target and opens the existing equipment picker.
- Empty nutrition retains its desaturated artwork and `Нет купленных` state.
- The shop CTA remains directly below the three slots.
- At `320px`, the slot list width equals its scroll width and the document has no horizontal overflow.

## Findings

No actionable P0, P1, or P2 differences remain for the requested state.

final result: passed

---

# Design QA — compact duel history result

## Evidence

- Source visual truth: `artifacts/duel-history-before.png` (734 × 932 px), the user-provided screenshot of the oversized expanded result.
- Rendered implementation: `artifacts/duel-history-compact-rounded-390.png` (390 × 844 px) at a 390 × 844 CSS viewport and device scale factor 1.
- Focused implementation crop: `artifacts/duel-history-compact-rounded-crop.png`; source and implementation were normalized to 676 px height for comparison.
- Combined comparison: `artifacts/duel-history-compact-comparison.png` (1132 × 676 px).
- State: Amateur → Duels → History → May 2026 → 25 May → winning Duel Opponent duel (`7:0`) expanded.

## Full-view comparison

The browser-rendered 390 px view keeps the modal header, duel summary row, both flat statistics tables, close action, and bottom navigation inside the viewport. The details no longer repeat the outcome, format, venue, or opponent as separate fact rows. Points and start time remain one flat line. `Итоговый результат` now mirrors the period table and shows both players' full-match goals, shots, conversion rate, and time. The expanded surface remains compact and its top and lower corners use the same soft rounding language as the surrounding duel UI.

## Focused comparison

The combined comparison confirms the intended density change: the original full result header, large outcome, type, opponent rows, and nested player cards are replaced by one compact `Очки / Начало` line and two matching flat tables: full-match result first, periods second. Both use `Игрок / Голы / Броски / % / Время`. Tiebreak information remains conditional and is absent from this decisive `7:0` result. A focused comparison was required because typography, vertical rhythm, and corner treatment were too small to judge reliably from the full screen.

## Required fidelity surfaces

- Fonts and typography: existing project font families and weights are preserved; compact labels remain uppercase and readable at 390 px; opponent text truncates in both the summary row and the table without disturbing numeric columns.
- Spacing and layout rhythm: duplicated blocks and nested statistic containers were removed, compact gaps are 5–12 px, period padding was reduced, and the expanded card uses a continuous 18/17 px rounded silhouette. The collapsed row now explicitly has a 17 px radius on all four corners instead of relying only on parent clipping.
- Colors and visual tokens: existing ink, muted, translucent surface, win/draw/loss, and border tokens are reused; no new accent color was introduced.
- Image quality and asset fidelity: no imagery or custom assets were added or altered.
- Copy and content: `Итоговый результат` presents both players' overall goals, shots, percentage, and time in the same vocabulary and order as every period.

## Interaction and console checks

- Opened History, navigated from September to May, opened 25 May, and expanded the winning Duel Opponent duel with score `7:0`.
- Collapsing the duel removed the details; clicking again reopened exactly one details block.
- The summary chevron uses the right-facing `ChevronRight` icon when collapsed and the same icon rotated upward when expanded; computed transforms were `none` and `matrix(0, -1, 1, 0, 0, 0)` respectively.
- The compact result exposes semantic tables named `Итоговый результат` and `1-й период`; the winning fixture reads `Вы 7 13 54% 30:00` in both because it contains one period.
- Collapsed-state computed radii are `18px` for the outer group and `17px` for the clickable row, so the bottom corners no longer appear square.
- The accordion row exposes opponent, format, score, venue, and outcome in its accessible name, so removing visual duplicates does not remove screen-reader context.
- Browser console errors checked after the interaction: 0.
- Five-match QA at `390 × 844`: with all rows collapsed, the list is `342px` high and its `scrollHeight` is also `342px`, so no scrollbar is introduced while the content fits.
- With the first of five matches expanded, the list remains the only scroll region: `clientHeight 515px`, `scrollHeight 591px`, and a real pointer scroll moves `scrollTop` from `0` to `76.5px`.
- Every match group reports `flex-shrink: 0`; collapsed rows remain `62px` high and the expanded group remains `311.5px` high instead of being compressed or clipped.
- The modal header and footer remain fixed while the list scrolls. The footer ends at `750.5px`, above the bottom navigation starting at `782px`, with `0px` overlap.
- When content remains below the viewport, the list now ends with a soft translucent fade and a centered down-chevron affordance. The affordance is rendered only while `scrollHeight - scrollTop > clientHeight`; it disappears at the bottom and is absent for five collapsed rows that fit without scrolling.

## Findings

- No actionable P0, P1, or P2 differences remain for the requested compact result state.

## Comparison history

- Initial finding (P2): expanded details repeated result, score, format, opponent, and start information, producing an oversized nested card.
- Fix: introduced the history-only compact result mode and tightened period spacing without changing the standalone result modal.
- Follow-up finding (P2): the expanded surface still had visually square corners.
- Fix: added matching top and bottom corner radii and recaptured the 390 px state.
- Follow-up finding (P2): period statistics still read as nested cards and the closed accordion affordance pointed down.
- Fix: replaced compact period cards with a semantic flat table and changed the closed/open affordance to right/up.
- User follow-up: overall match numbers should use the same comparison structure as periods, not a second line of scalar facts.
- Fix: replaced the scalar `Счёт / Процент` line with a matching `Итоговый результат` table for both players and explicitly rounded the collapsed row.
- Review finding (P1): the old short `aria-label` hid the visible score, format, venue, and outcome from screen readers.
- Fix: expanded the row's accessible name with all five summary fields and added a regression assertion.
- Five-match finding (P1): flex items were allowed to shrink, so opening one match compressed and visibly clipped the bottoms of every row.
- Fix: disabled shrinking on each complete match group. The modal stays intrinsic and scrollbar-free while five collapsed rows fit; once content exceeds the viewport limit, the entire list, including the expanded match, scrolls as one region.
- Follow-up finding (P2): even with correct scrolling, the hard lower crop made the next duel look accidentally cut off.
- Fix: added an overflow-aware fade and down-chevron scroll affordance, backed by a regression that verifies appearance on overflow and disappearance at the list end.
- Post-fix evidence: `artifacts/duel-history-compact-comparison.png` and `artifacts/duel-history-compact-rounded-390.png`.

## Follow-up polish

- None required for this iteration.

final result: passed

---

# Design QA — поздравление призёров регулярного чемпионата

## Evidence

- Rendered local preview at `323 × 844`, `340 × 844`, `360 × 844`, and `390 × 844`.
- Screenshots: `output/playwright/regular-podium-323.webp`, `regular-podium-340.webp`, `regular-podium-360.webp`, and `regular-podium-390.webp`.
- Placement variants 2 and 3 additionally checked at `323 × 844`: `output/playwright/regular-podium-place-2-323.webp` and `regular-podium-place-3-323.webp`.

## Checks

- All three placement headings wrap without clipping at 323 px.
- The tournament title stays on one line and truncates with an ellipsis.
- Artwork remains square and uses the gold, silver, or bronze cup variant.
- Reward values wrap at the narrowest width without overlapping or widening the modal.
- The close button remains fully visible and reachable.
- At 323 px, document `scrollWidth` and viewport width are both `323px`; no horizontal overflow.
- Browser console errors: 0.
- The preview harness was local-only and removed after capture; it is not part of the product bundle.

## Findings

- No actionable layout issues found at the requested narrow widths.

final result: passed

---

# Weekly challenge catalogue design QA

## Evidence

- Source visual truth:
  - `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-00d6e8da-76de-45e7-b512-b200867ffebd.png` — shared segmented control treatment.
  - `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-523b27cd-9976-4888-92f2-93f831339bea.png` — task-row treatment and requested completion check location.
- Rendered implementation: `output/playwright/challenge-catalog-after.png`.
- Focused comparisons:
  - `output/playwright/challenge-filter-comparison.png`.
  - `output/playwright/challenge-tasks-comparison.png`.
- Browser URL: `http://127.0.0.1:5173/achievements/weekly-challenge`.
- Viewport: 709 x 1296 CSS px, device pixel ratio 2; app shell 430 x 1296 CSS px.
- Captured screenshot: 709 x 1296 px, normalized by the browser capture to CSS-pixel dimensions.
- Source pixels: segmented control 814 x 154; task region 748 x 312. Focused comparisons normalize both source and implementation to 383 px width.
- State: authenticated local preview, active challenge selected, one completed task.

## Full-view comparison

The challenge screen keeps the existing 430 px mobile app shell, ice-arena background, shared page tabs, compact challenge card, and bottom navigation. The new filter fits completely inside the content width and no longer clips the third option.

## Focused comparison

- Filter: the implementation now uses the same single frosted pill container, three equal-width segments, navy selected segment, light inactive segments, white border, and count badges as the established shop/duel pattern.
- Tasks: row typography, right-aligned progress values, separators, and thin progress tracks remain aligned with the reference. The completed-task check is intentionally changed from cyan to dark navy per the latest user instruction.

## Required fidelity surfaces

- Fonts and typography: existing application font stack and weights are preserved; all three labels fit without truncation.
- Spacing and layout rhythm: 4 px outer padding and 4 px inter-segment gap match the shared `SegmentedTabs` component; the control is 382 x 48 CSS px and stays inside the 382 px content width.
- Colors and visual tokens: selected segment uses the shared navy active state; inactive background and white outline inherit the arena segmented-tabs tokens; completion check is `#17233d`.
- Image quality and asset fidelity: no new raster assets are introduced; the existing arena background remains sharp and unchanged.
- Copy and content: `Действующие`, `Будущие`, `Пройденные` and their counts are unchanged.

## Comparison history

1. Initial finding: P2 — three independent chips overflowed horizontally and visually diverged from the shop/duel segmented control; the completion check used the cyan progress color.
2. Fix: replaced independent chips with one shared segmented container, equalized three columns, retained compact count badges, and added a dedicated dark-navy completion-check class.
3. Post-fix evidence: both focused comparison images show the unified control and the dark completion check with no clipping.

## Findings

No remaining P0, P1, or P2 differences for the requested areas.

## Primary interactions and console

- Switched between Future, Active, and Completed filters successfully in the local browser.
- Future join action and completed-state label are present in their respective views.
- Local mock WebSocket is connected for preview; no reconnect banner is present in the final state.

## Follow-up polish

No P3 item is required for this iteration.

final result: passed

---

# Weekly challenge filter labels follow-up QA

## Evidence

- Source visual truth:
  - `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-095f9ac1-6b47-404b-86ef-ff44d3877f20.png` — segmented filters without inline counters.
  - `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-6f3d684d-11c5-40b6-ae4c-78f0d3e32d4d.png` — separate uppercase section heading with count.
  - `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-3decf513-cf67-4eb0-817b-2cb9acae8e15.png` — section heading must have no left inset.
- Rendered implementation: `output/playwright/challenge-catalog-after.png`.
- Browser URL: `http://127.0.0.1:5173/achievements/weekly-challenge`.
- State: authenticated local preview, completed challenge selected.

## Checks

- Filter tabs contain labels only; counts are not rendered inside the segmented control.
- The section heading mirrors the selected filter and renders its item count in parentheses.
- Switching Future, Active, and Completed updates both content and heading.
- The heading aligns with the left edge of the filter and challenge card without inherited `section-label` padding.
- Completed-task checks remain dark navy (`#17233d`).
- Browser console errors: 0.

## Findings

No remaining actionable differences for the requested filter and section-heading treatment.

final result: passed

---

# Inventory catalogue, bank, and transaction history QA

## Evidence

- Source visual truth:
  - `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-20927a2b-5ab7-4a83-8f8f-6aa79cb1cfc8.png` — inconsistent horizontal page padding.
  - `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-27303d44-bc21-4e4e-9707-f7a273064d17.png` — vertical bank cards to replace.
  - `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-96faf487-3da2-4390-83df-676600fa6ddd.png` — transaction history readability problem.
- Rendered local implementation checked in the Codex in-app browser at `http://127.0.0.1:5173/inventory`.
- State: authenticated local preview with six products, three bank packages, and four representative transaction records.
- App shell: 430 CSS px wide.

## Checks

- Inventory product cards remain one horizontal row and no longer reserve obsolete grid rows below their content.
- Inventory, achievements, and weekly-challenge screens use the shared 14 px horizontal page padding.
- Bank packages render as one horizontal card per row with icon, copy, price, and disabled purchase action.
- History filters use the shared `SegmentedTabs` control used by the shop and duel flows.
- Transactions are grouped by calendar date and rendered as separate compact rows with category icon, title, time, source, and right-aligned currency amounts.
- Long achievement titles wrap instead of being truncated to an ambiguous single line.
- Positive amounts use the success tone; purchases retain the appropriate currency tone.
- Empty transaction history is plain readable text without a glass container.
- Goods, Bank, and History tab switching was exercised in the local browser.
- Browser console errors: 0.

## Findings

- No remaining actionable layout issue was found in the requested areas at the rendered app-shell width.

final result: passed

---

# Inventory transaction amount follow-up QA

## Evidence

- Profile visual source: the experience balance uses the `TrendingUp` icon and `--reward-experience` color.
- Rendered local implementation checked in the Codex in-app browser at `http://127.0.0.1:5173/inventory`.
- Browser-computed values: experience `rgb(37, 99, 235)`; coin and ruble debits `rgb(185, 28, 28)`.

## Checks

- Experience transaction amounts use the same `TrendingUp` icon and blue experience tone as the profile.
- Every negative amount uses the shared deep-red danger tone regardless of currency.
- Positive coin and star amounts retain their existing profile-aligned currency colors.

## Findings

- No remaining mismatch was found for the requested transaction icons and amount colors.

final result: passed

---

# Training period speed summary QA

## Evidence

- Source visual truth: `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-9d6acb2f-71cf-4177-a911-32b84702fbd0.png`.
- Component contract: `PeriodSpeedSummary` uses the shared `.section-label` typography and an explicit four-column `minmax(0, 1fr)` grid.
- Focused `DailyScreen` regression test verifies both contracts.

## Checks

- “Скорости 1-го периода” uses the same font size, weight, letter spacing, and color as other section labels inside setup cards.
- Gates, goalie, player, and puck values occupy one row of four equal columns.
- Compact responsive type and zero-minimum grid columns prevent horizontal page scrolling on narrow screens.
- Focused test, project lint, server typecheck, web production build, and `git diff --check` pass.

## Findings

- Rendered authenticated QA remains pending because the local browser session is currently signed out; no authentication state was changed automatically.

final result: passed with rendered follow-up pending

---

# Bank package design QA

## Evidence

- Source visual truth: `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-af37ef74-b2db-40b3-905e-a861795ee6a8.png` (844 x 1034 px, approximately 422 CSS px at 2x density).
- Browser-rendered implementation: live Codex in-app browser capture at `http://localhost:5173/inventory`, Bank tab; application shell width 430 CSS px.
- State: authenticated local dev profile; purchase buttons disabled as in the source.

## Full-view and focused comparison

The implementation retains the source hierarchy and geometry: shop header, balance pill, segmented control, section label, single-column frosted cards, coin icon, copy column, price column, and disabled CTA. Seven packages use neutral purchase-oriented names. Long values, the `Премиальный банк` and `Максимальный банк` titles, prices, benefit labels, and recommendation markers remain readable without horizontal overflow or collision with the action column.

## Required fidelity surfaces

- Fonts and typography: existing app family, weights, sizes, and line heights are preserved.
- Spacing and layout rhythm: original icon, padding, radius, and list gap are preserved; labels use the existing pill radius.
- Colors and tokens: existing glass, ink, muted, and reward-coin tokens are reused; benefit pills use the established pale-blue tournament treatment so they do not merge visually with the green coin amount.
- Image quality and assets: arena background and existing coin icon are unchanged; no placeholder assets were introduced.
- Copy and content: seven prices from 149 ₽ to 9 990 ₽ render with a benefit ladder of 0%, 7%, 14%, 21%, 27%, 30%, and 40%. Compact absolute-positioned markers do not affect card height; `Хит` marks 699 ₽, `Топ` marks 4 990 ₽, and the gold `Премиум` marker plus `Максимальная выгода` belong only to the final package.

## Findings

No actionable P0, P1, or P2 differences were found. The extra labels are an intentional extension of the supplied design.

## Comparison history

- Initial rendered pass: recommendation badges increased card height and benefit labels merged with the coin color.
- Final rendered pass: seven equal-height cards, blue benefit pills, and overlaid `Хит`/`Топ`/`Премиум` markers verified at 430 CSS px; no P0/P1/P2 findings.

final result: passed

---

# Weekly challenge admin mobile task form QA

## Evidence

- Source diagnosis: the task row previously required four fixed minimum-width columns (`180 + 220 + 110 px + action`).
- Regression coverage: `WeeklyChallengesAdmin.test.tsx` verifies that each task uses the responsive task-row contract and keeps its remove action inside that row.

## Checks

- Desktop and tablet task rows retain four horizontal columns.
- At widths up to 640 px, task type, title, target, and remove action form one vertical column.
- The remove action fills the task card width and remains centered.
- Challenge payload, validation, add/remove behavior, and save behavior are unchanged.

## Findings

- Authenticated rendered checks at 323, 360, and 430 px remain pending because the current local API session returns an authorization/load error; no account or authentication state was changed automatically.

final result: passed with rendered follow-up pending
