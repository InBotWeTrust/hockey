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
