# Duel format achievements

User approved implementation of the proposed achievements with annotated corrections on 2026-11-27.

## Approved behavior

Seven variants: Express, Mix, Classic, Sniper, Marathon 4 seconds, Marathon 7 seconds, Rhythm. Each has wins at 1/5/15/50/100/250/500/1000 and consecutive wins at 2/5/7/10.

Special tasks:
- Sniper Quality: win with fewer goals and strictly more awarded points, once.
- Sniper Arsenal: 3/5/7 recognized primary goal techniques in one match.
- Sniper Jeweler: two goals worth exactly 2 points (stored as 20) in one match, once.
- Each Marathon variant separately: win with zero timer penalties, once; 5/10/20/30/40/50/60 goals without a timer penalty between them. A miss alone does not reset this run.
- Rhythm Wave: uninterrupted series 4/10/15/20/30/40/50.
- Rhythm Recovery: after breaking a qualifying series, build another of 4/7/10 in that match.
- Rhythm Longer: win with equal positive score by the series tie-break, once.
- Universal: at least 1/5/10/20/50/100/300/500 wins in EACH of all seven variants.

## Implementation decisions

Use server-accepted shots, authoritative settlement and existing scoring projectors. Start progress with matches created after migration launch; do not import history. Normal completed matches count; technical settlements award nothing and break the affected format's current streak. Repeated events cannot duplicate progress. Losses in a different variant do not reset a variant's streak. Retain lifetime wins, best streaks and per-match feat peaks while rewards await claiming; claiming opens the next level against cached progress. Use the existing atomic stars/experience claim, with no coins or tokens for new tasks.

Rewards follow existing hockey/bar ladders: wins 3/7/15/30/50/90/150/250; streak 5/10/20/35. Special ladders use existing small skill rewards; universal requires seven milestones and has 10/20/35/60/100/175/300/500. Stars and experience are equal. User additionally requested new illustrations and descriptions. Generate one distinct illustration per card, 640px WebP plus 160px thumbnail, using the existing image cache and standard UI. One-time tasks have no artificial level label. Restrict existing goal-margin and format-specific no-error tasks to Express/Mix/Classic; keep other old rules unchanged.

## Constraints

No deterministic engine behavior changes, no credentials/account/auth modifications, no production changes. Local implementation is authorized. Deployment requires separate exact-scope release notes approval under AGENTS.md.
