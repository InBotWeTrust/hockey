# Bar regressions and production parity

Approved execution: implement sequentially in this session, verify locally, deploy dev then production. Preserve unrelated development and production exclusions.

1. Game help: shared modal width, plain heading, regular-weight description; compare character information dialog.
2. Loading/errors: remove inappropriate rink background and retain readable themed retry state.
3. Navigation: Back only in pending invited card table; keep exit/rules consistent, use plain question mark.
4. Pool layout: reserve identical controls space before and after readiness.
5. Pool gestures: suppress native selection, dragging and context menu on aiming surface only.
6. Monitor: current match contributes to count but not urgency/pulse while viewed; other events still signal.
7. Battleship rotate: shared light-theme icon surface.
8. Bar monitor entries: game label, opponent avatar/name, preserve status and return behavior.
9. Character details: readable light theme metadata, slightly stronger portrait border.
10. Chat invites: countdown minutes/seconds, seconds only below one minute; boundary regression cases.
11. Profile challenge: reveal capacity choices after selecting cards; avoid scrolling other games.
12. Ochko: compare dev/prod, enforce five deals for Grigory without rewriting active games blindly.
13. Duel fights: inspect production release gates/settings and enable approved implementation using release workflow/migration as appropriate.

Verification: reproduce each failure with behavioral tests or rendered CSS/gesture evidence, observe RED, apply minimal fix, verify GREEN. Check mobile light/dark and readiness transitions. Test server timing/configuration using isolated PostgreSQL only. Review combined diff, types, lint, builds and CI. Release exact SHA to dev, verify then selectively promote to production, confirm deployment, migrations, health, frontend and PWA version. Distinguish authenticated acceptance from fixtures and deployment proof.

Review focus: ongoing pool aim must not open browser menus; no table resize at readiness; current match suppression must not hide other urgent matches; opponent identity must follow player index; five-deal parity must preserve legacy snapshots; enabling fights must not accidentally enable excluded training content.

## Local evidence

- Rules RED: 320px, opaque dark header, copy weight 700. GREEN: shared information width up to 440px, transparent header, copy weight 400.
- Access-error regression RED then GREEN; rendered foreground is above the themed backdrop without rink artwork.
- Extra Back reproduced in all six game menus and active cards; removed while invited-room navigation still confirms zero leave commands.
- Pool controls/context menu RED then GREEN. Browser stage remains 394x651 and controls 350x64 before/after readiness. Native device long-press acceptance is separate from CSS/event evidence.
- Current-match tests cover bar, ordinary duel, classic/playoff identities, other urgent events and malformed URLs.
- Naval rotate shares light-game artwork control styling. Opponent identity tested for both indices; shared duel identity renderer reused.
- Character metadata: RGB 189/197/208 to 71/85/105 in light mode; portrait border 1px to 2px.
- Countdown regression: 290, 60, 59 seconds. Scrolling RED then GREEN; browser choices bottom 575px inside scroller bottom 583px.
- Combined web run: 337 passed, then additional route robustness passed (7/7 helper suite).
- Isolated PostgreSQL scenarios/migration/deck: 56 passed; real Grigory constructor integration added and integration/migration 37 passed. No production account/game mutated locally.
- New Grigory games already explicitly use engine 20/five deals on both lines. Legacy default constructor (12/four deals) now follows ENGINE_VERSION; explicit legacy versions remain four. Release audit reports aggregate existing versions/rounds.
- Fight cause: dev workflow enabled the DB flag separately, prod did not. Migration 240 enables only duels.fights.enabled. Audit CLI failed with disabled fights and succeeded after migration in temporary PostgreSQL.
