# Tournament Championship and Playoffs Design

## Goal

Add configurable individual tournaments on top of the existing amateur duel engine. A tournament owns registration, schedule, standings, playoffs, rewards, live coordination, and communication. Deterministic shot resolution, inventory consumption, anti-cheat validation, and arena snapshots remain owned by the amateur duel domain.

## Formats

- `head_to_head`: configurable round-robin cycles. A round gives every participant at most one fixture; odd fields receive one balanced bye. Rounds assigned to the same day use sequential windows.
- `daily_aggregate`: one complete normal daily game per participant-local calendar date. Scoring supports goal sum, average accuracy, or configurable points by daily place, optionally using only the best N days.

Head-to-head tournaments support at most 64 participants; daily aggregate tournaments support 10,000. Playoffs support exactly 2, 4, 8, or 16 seeds.

## Lifecycle and Safety

The lifecycle is `draft -> registration -> scheduling -> regular -> playoff -> completed`, with `registration_blocked`, `paused`, `cancelled`, and `archived` side states. Published rules are immutable revisions. State transitions, fees, refunds, rewards, and automatic dispatches are transactional and idempotent. A tournament can be hard-deleted only while it is an empty draft.

Public tournament surfaces are gated by `tournaments.enabled`. Admin endpoints remain available while the flag is disabled so a complete synthetic season can be prepared on dev.

## Registration and Economy

Registration modes are open, approval-required, and invite-only. Invite-only tournaments may be public or hidden. Eligibility can constrain competition level, lifetime goals, experience, capacity, invitations, and bans. Entry is free or costs a fixed coin amount. Concurrent tournament participation is allowed.

Stage rewards are fixed mappings from regular-season place and final playoff place to experience, coins, and stars. Fees do not create a dynamic prize pool. Cancellation refunds entry fees but never claws back already-issued stage rewards.

## Fixtures, Ties, and Playoffs

A visible tournament fixture consists of one or more duel segments: regulation, overtime, initial shootout, and one-shot sudden-death pairs. Each segment is an `amateur_duel_match` with `source='tournament'` and tournament settlement policy. Tournament segments do not update the normal amateur rating or issue duel-template stakes/rewards.

Regular points are configurable per outcome. A deterministic ordered tie-break chain sorts standings. A complete tie at the playoff cut creates a tie-break fixture.

The playoff bracket is fixed: highest seed versus lowest seed. Every round configures its duel template, wins required, game windows, breaks, tie-break rules, and a home sequence such as `H-H-A-A-H-A-H`. The higher original seed owns `H`. Home advantage changes only venue and ordering. Playoffs with four or more seeds always include a third-place series.

## User and Admin Experience

The amateur area gains `Duels | Tournaments`. The tournament hub groups personal, registering, active, and completed tournaments. Tournament details expose Overview, Standings, Schedule, Playoffs, and Rules & Prizes.

Admins use a draft-saving wizard: basics, access, regular season, playoffs, schedule, rewards, notifications, and review. Before publishing they can regenerate schedules. After publishing they can only reschedule individual rounds/fixtures, pause/resume, resolve incidents, withdraw/disqualify participants, cancel, or archive, always with an audit reason.

Players may propose and confirm a live time inside a fixture window. Confirmed live games expose presence and aggregate progress over a match WebSocket, while the underlying HTTP game remains playable if realtime disconnects.

Tournament push notifications have global templates plus per-tournament overrides. Manual communication supports an official news post, participant DMs from the configured system account, and participant push broadcasts. No tournament-specific chat is created.

## Verification

All clocks are injectable. Tests cover schedule generation, local-date aggregation, scoring and tie-breaks, bracket sizes, home sequences, segment progression, no-shows, withdrawals, concurrency, idempotent economy and notifications, access control, WebSocket reconnect, and user/admin UI. Dev acceptance runs complete synthetic seasons for both formats before enabling the feature flag.

