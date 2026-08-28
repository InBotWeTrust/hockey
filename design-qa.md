# Bonus game card design QA

- Source visual truth: `/var/folders/8b/pys5c4bd0xl7_cw0xhk5s3nw0000gn/T/codex-clipboard-bd5dbcae-95ff-47b5-9ba5-e4f4d094fdbf.png`, plus the user's instructions to replace the CTA with a reserved chevron, show a lock for closed games, move period and shot limit to the second line, and render completed rewards in monochrome.
- Implementation screenshot: `/private/tmp/hockey-dev-bonus-qualifications-20260826/implementation-bonus-games-accuracy.png`
- Focused comparison: `/private/tmp/hockey-dev-bonus-qualifications-20260826/bonus-card-comparison.png`
- Route: `http://127.0.0.1:5191/bonus-games?from=sections`
- State: Speed locked cards and Accuracy completed cards.
- Viewport: 889 x 937 CSS px, device pixel ratio 2.
- Source pixels: 846 x 362. Implementation pixels: 889 x 937; focused implementation crop: 402 x 144.
- Density normalization: source was resized proportionally to 144 px card height for focused comparison; the implementation card was captured at its rendered 402 x 144 CSS size.

## Full-view comparison evidence

The local screen keeps the existing card hierarchy and imagery. The bottom CTA is gone, the entire actionable card remains an accessible control, and the right-side chevron occupies a fixed column. Closed cards preserve that column with a hidden chevron and show a lock in the former completion-marker position. Completed cards show a check, a visible chevron, and muted monochrome rewards.

## Focused-region comparison evidence

The focused comparison confirms the same image-to-copy proportion, two-line rules block, reward baseline, marker position, radius, and card height. The intentional state differences are correct: locked cards use a lock and colored first-clear rewards; completed cards use a check, actionable chevron, and gray historical rewards.

## Required fidelity surfaces

- Fonts and typography: existing project typeface, weights, line height, and hierarchy are preserved; target/series remain on line one and period/shot limit remain on line two.
- Spacing and layout rhythm: card height remains 144 px; rewards, text, marker, and chevron stay inside the card with consistent padding.
- Colors and visual tokens: existing glass surface is unchanged; completed rewards use neutral ink opacities instead of semantic reward colors.
- Image quality and asset fidelity: existing arena assets and crops are unchanged.
- Copy and content: action labels remain available to assistive technology; visible CTA text is removed; period and shot limit are grouped on the second line.

## Findings

No actionable P0, P1, or P2 mismatch remains.

## Comparison history

- Final pass: verified Speed and Accuracy tabs after the requested state changes. No additional QA fix loop was required.

## Interaction and console checks

- Switched between Speed and Accuracy tabs.
- Verified actionable card controls and locked-card absence of controls through the rendered accessibility tree and automated interaction tests.
- Browser console errors: none.

## Implementation checklist

- [x] Remove visible CTA.
- [x] Make actionable cards fully clickable.
- [x] Reserve the chevron column in every compact card.
- [x] Show locks for closed games and checks for completed games.
- [x] Put period and shot limit on the second line.
- [x] Show completed rewards in monochrome.

final result: passed
