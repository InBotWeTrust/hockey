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

final result: passed
