# Amateur Story Implementation Plan

**Goal:** One amateur onboarding and replayable second profile story, with six pairs of optimized illustrations.
**Architecture:** Reuse OnboardingFlow lifecycle and OnboardingGate exit trigger. Add a dedicated narrative data source and cinematic renderer using beginner CSS and image cache. Extend /me with the existing amateur completion flag.
**Spec:** ../specs/2026-10-04-amateur-story-design.md
**Execution:** Inline, no delegation. Preserve unrelated changes; no deployment.

## Tasks
- [x] Profile contract: regression test false/true amateur completion mapping, observe RED, expose flag from existing users column, GREEN.
- [x] Narrative: regression tests required vs replay, late name reveal, cue-timed image change, atomic scene reset, loading failure/retry and reduced motion; observe RED; minimal renderer; GREEN.
- [x] Integration: test cinematic amateur completion with all published step evidence and retry; use shared renderer in required mode and profile replay; completion failure remains retryable.
- [x] Catalog/routes: second series locked until amateur completion, unlocked navigation and direct route guard; preserve first series and section introduction gates.
- [x] Artwork: create six pairs; inspect identity/style/anatomy/geometric alignment; regenerate rejected frames; convert WebP without geometry change, optimize quality and content hashes. Record prompts/paths and sizes.
- [x] Verify focused web/server tests, typecheck, scoped lint/build and diff-check. Browser mobile/compact replay, cues, refresh and loading; preserve account/auth state. Commit task branch, no push/deploy.

## Review focus
Game exit, reload after completion, legacy published step counts, slow/failed decode, duplicate completion click, stale profile cache, failed progress save, reduced motion, no frame-B flash.

Validation evidence: ../../artwork/amateur-story/verification.md. Authenticated promotion is automated-test coverage only; no account changes or deployment.
