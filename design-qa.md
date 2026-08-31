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
