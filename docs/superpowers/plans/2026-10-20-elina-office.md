# Elina Office Implementation Plan

Goal: Connect the approved weekly office schedule, Elina persona and ordinary conversation without a quest or game; release to dev.

Architecture: Extend existing staff-room and conversation paths. Server chooses a deterministic per-user local calendar day mode; one scene per week with adjacent-week protection, other days empty/seated. Reuse conversation memory, moderation, reservation and limits. Preserve special scene warning/fight flow. Elina harassment has one Oleg warning then office ejection, not a game. Reuse generated transparent chair and emotion assets.

Approved scope: earlier bar requirements plus explicit user instruction to implement and deploy now. Defaults: individual schedule, Monday-based weeks, approximately half remaining days seated, daily departure after ejection. No trust objective, unlock or game.

- [x] RED schedule boundary/year/week adjacency and stable results; persona and gated conversation tests.
- [x] Add schedule helper and additive migration for office warning/departure state.
- [x] Extend staff-room phases, empty 30-second timeout, scene 3-second timeout, leave and daily reset.
- [x] Add Elina soul/biography, authenticated conversation gate and atomic warning/ejection; use real per-user game/fight history.
- [x] Connect UI neutral/emotion figure, empty chair, ordinary conversation, cleanup and error handling; update isolated preview.
- [x] GREEN targeted server/web suites, persistence on isolated DB if available, typechecks/build/lint, mobile browser acceptance.
- [ ] Review diff, PR, integrate into latest dev without overwriting concurrent changes, Actions/runtime/assets/PWA proof.
- [ ] Update bar requirements and send user current remaining requirements.

Files: server bar/officeSchedule.ts, elinaOffice.ts, staffRoom.ts and related routes/tests; conversationRoutes/Store/Memory/types/openAIAnswer and personas/elina; additive DB migration. Web BarStaffRoom/API/CSS, conversation character types, existing emotion renderer, preview and tests. Generated assets copied/encoded from existing artifact masters; preserve source PNGs and alpha.

Risk checks: no client-controlled mode/day; no API conversation when absent; no duplicate warnings/ejections/charges; no effect after cancelled visit; no two adjacent weekly scenes; no returned private conversations of other users; old scene/fight retry protection retained; failed LLM leaves no paid receipt; no game menu for Elina.
