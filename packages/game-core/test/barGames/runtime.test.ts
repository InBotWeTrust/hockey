import { expect, it } from 'vitest';
import { createMatch, command, advance, ENGINE_VERSION } from '../../src/barGames/runtime.js';
it('uses a single 40s series deadline, excludes flight and resets only on manual dart', () => {
  let m = createMatch('darts', 0, 0, false, 1);
  expect(m.deadline).toBe(40000);
  m = command(m, 0, { type: 'dart', gesture: { dx: 0, dy: -0.5, durationMs: 400 } }, 1000);
  expect(m.deadline).toBe(41050);
  expect(m.animationUntil).toBe(2050);
  m = advance(m, 41050);
  expect(m.missed[0]).toBe(1);
  expect(m.game.turn).toBe(1);
  expect(m.engineVersion).toBe(ENGINE_VERSION);
});
it('loses on a second consecutive own timeout in both modes', () => {
  for (const computer of [false, true]) {
    let m = createMatch('checkers', 0, 0, computer, 7);
    m = advance(m, 40000);
    expect(m.missed[0]).toBe(1);
    if (computer) m = advance(m, m.animationUntil);
    else
      m = command(
        m,
        1,
        { type: 'checkers', path: moves(m.game as Checkers)[0]! },
        m.animationUntil,
      );
    m = advance(m, m.deadline);
    expect(m.game.winner).toBe(1);
    expect(m.reason).toBe('inactivity');
  }
});
import { moves, type Game as Checkers } from '../../src/barGames/checkers.js';
it('rejects input during animation, after deadline and from the wrong player', () => {
  const m = createMatch('darts', 0, 0, false, 1);
  expect(() =>
    command(m, 1, { type: 'dart', gesture: { dx: 0, dy: -0.5, durationMs: 400 } }, 1),
  ).toThrow();
  expect(() =>
    command(m, 0, { type: 'dart', gesture: { dx: 0, dy: -0.5, durationMs: 400 } }, 40000),
  ).toThrow();
  const n = command(m, 0, { type: 'dart', gesture: { dx: 0, dy: -0.5, durationMs: 400 } }, 1);
  expect(() =>
    command(n, 0, { type: 'dart', gesture: { dx: 0, dy: -0.5, durationMs: 400 } }, 2),
  ).toThrow();
});
it('restores elapsed deadlines on reconnect without granting extra time', () => {
  const m = createMatch('billiards', 0, 0, false, 3);
  const n = advance(m, 125000);
  expect(n.game.winner).toBe(1);
  expect(n.reason).toBe('inactivity');
});
it('performs deterministic legal computer turns and never pauses on read', () => {
  const m = createMatch('darts', 1, 100, true, 20);
  expect(advance(m, 10000)).toEqual(advance(m, 10000));
  const n = advance(m, 10000);
  expect(n.game.turn).toBe(0);
  expect(n.deadline).toBeLessThan(50000);
});
it('publishes action feedback with actual dart scoring and bust without changing the rules', () => {
  let m = createMatch('darts', 0, 0, false, 1);
  const gesture = { dx: 0, dy: -0.5, durationMs: 400 };
  m = command(m, 0, { type: 'dart', gesture }, 100);
  expect(m.feedback).toMatchObject({ type: 'dart', actor: 0, points: 50, bust: false });
  const small = createMatch('darts', 0, 0, false, 1);
  if (small.game.kind === 'darts') small.game.scores[0] = 20;
  expect(command(small, 0, { type: 'dart', gesture }, 100).feedback).toMatchObject({
    points: 50,
    bust: true,
  });
});

it('spaces Maria darts and retains all hits for the final flight', () => {
  const m = createMatch('darts', 1, 0, true, 20);
  const first = advance(m, 1800);
  expect(first.revision).toBe(1);
  expect(first.animationUntil).toBe(4650);
  expect(advance(first, 4649).revision).toBe(1);
  const third = advance(first, 7500);
  expect(third.dartHits).toHaveLength(3);
});
it('shares aim without resetting the clock or inactivity and previews the bot shot before motion', () => {
  const m = createMatch('billiards', 0, 0, false, 1);
  m.missed[0] = 1;
  const aimed = command(m, 0, { type: 'aim', angle: -1, power: 0.5 }, 100);
  expect(aimed.poolAim).toMatchObject({ angle: -1, actor: 0 });
  expect(aimed.deadline).toBe(m.deadline);
  expect(aimed.missed[0]).toBe(1);
  expect(() => command(m, 1, { type: 'aim', angle: 0, power: 0.5 }, 100)).toThrow();
  const bot = createMatch('billiards', 1, 0, true, 1);
  const preparing = advance(bot, bot.animationUntil);
  expect(preparing.poolAim?.actor).toBe(1);
  expect(preparing.poolFrames).toHaveLength(0);
  expect(advance(preparing, preparing.animationUntil - 1)).toEqual(preparing);
  const shot = advance(preparing, preparing.animationUntil);
  expect(shot.poolShot).toBeDefined();
  expect(shot.poolFrames.length).toBeGreaterThan(0);
});
it('preserves spin in shared aim and the authoritative shot animation', () => {
  const m = createMatch('billiards', 0, 0, false, 1);
  const spin = { x: 0.2, y: -0.5 };
  const aim = command(m, 0, { type: 'aim', angle: -1, power: 0.5, spin }, 100);
  expect(aim.poolAim?.spin).toEqual(spin);
  const shot = command(aim, 0, { type: 'shot', angle: -1, power: 0.5, spin }, 200);
  expect(shot.poolShot?.spin).toEqual(spin);
  expect(() =>
    command(m, 0, { type: 'aim', angle: 0, power: 0.5, spin: { x: 1, y: 1 } }, 100),
  ).toThrow();
});
it('clears the previous pool stroke when placing the cue after an opponent foul or timing out', () => {
  const initial = createMatch('billiards', 1, 0, true, 1);
  const foul = command(initial, 1, { type: 'shot', angle: 0, power: 0.2 }, initial.animationUntil);
  expect(foul.feedback?.foul).toBe(true);
  expect(foul.game.turn).toBe(0);
  expect(foul.poolShot).toBeTruthy();
  const placed = command(
    foul,
    0,
    { type: 'place', point: { x: 0.5, y: 1.5 } },
    foul.animationUntil,
  );
  expect(placed.poolShot).toBeNull();
  expect(placed.poolAim).toBeNull();
  expect(placed.poolFrames).toHaveLength(0);
  const missed = advance(foul, foul.deadline);
  expect(missed.poolShot).toBeNull();
});
