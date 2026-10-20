# Apartment five-page implementation plan

Goal: implement approved Профиль / Награды / Друзья / Сюжет / Настройки apartment, with inventory in the separate locker.
Spec: approved discussion and /private/tmp/uh-apartment-locker-design-2026-10-19.md section2. User authorized execution. No new artwork generation, accounts, data mutations, deployment or agents.
Base: fetched origin/dev8c964b0d. This branch includes the completed locker feature as an explicit dependency; no old customization code is imported.

- [ ] Write RED tests for five-page scene, legacy referrals selected inside friends, no inventory tab, preserved original panorama positions and reward badge.
- [ ] Implement scene mapping; preserve six-column source image with five meaningful targets (mirror0,trophies2,friends4,TV5,desk3), removing the wardrobe target. This is a functional layout using existing artwork, not approved final new interior art.
- [ ] Write RED friends screen tests for existing social controls, invite summary/link, loading/error/retry.
- [ ] Implement ProfileFriendsScreen; retain existing referrals screen as nested route with back to friends, keeping referral reward operations unchanged. Remove hidden overview and its fake decoration; retain a dedicated referral attention query.
- [ ] Keep profile page named Профиль in apartment context, preserve avatar/bio/balances/statistics. Add earned-versus-pending achievements link on rewards. Add TV frame around story catalog without changes to episode access.
- [ ] Run targeted suites, typecheck/lint/build; inspect mobile browser all five pages and referral return at320/430. Record existing failures separately. Review diff and commit. Do not push (previous remote publication approval remains pending).

Execution: sequential, TDD for behavior. Main dirty checkout and completed locker checkout preserved. New composition/art, external visits, appearance constructor, upload/monetization remain future work.
