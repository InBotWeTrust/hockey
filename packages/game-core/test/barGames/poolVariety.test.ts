import { expect, it } from 'vitest';
import * as pool from '../../src/barGames/pool.js';
import { advance, createMatch } from '../../src/barGames/runtime.js';

it('uses several repeatable legal breaks with different resulting layouts', () => {
  const game = pool.create(1);
  const shots = new Set<string>();
  const layouts = new Set<string>();
  const firstContacts = new Set<number | null>();
  const pocketedGroups = new Set<pool.Group>();
  for (let seed = 1; seed <= 24; seed++) {
    const choice = pool.bot(game, true, .5, seed);
    expect(choice).toEqual(pool.bot(game, true, .5, seed));
    const result = pool.shoot(game, choice.shot, 'responsive', false);
    expect(result.firstContact).not.toBeNull();
    expect(result.game.lastFoul).toBe(false);
    expect(result.game.winner).toBeNull();
    shots.add(JSON.stringify(choice.shot));
    layouts.add(JSON.stringify(result.game.balls));
    firstContacts.add(result.firstContact);
    result.pocketed.filter(id => id > 0 && id !== 8).forEach(id => pocketedGroups.add(pool.group(id)));
  }
  expect(shots.size).toBeGreaterThanOrEqual(4);
  expect(layouts.size).toBeGreaterThanOrEqual(4);
  expect(firstContacts.size).toBeGreaterThanOrEqual(3);
  expect(pocketedGroups.size).toBe(2);
});

it('varies legal targets and cue positioning on the same open position', () => {
  const game: pool.Game = {
    ...pool.create(1), break: false, groups: ['stripes', 'solids'],
    balls: [
      { id: 0, x: .5, y: 1.2, pocketed: false },
      { id: 1, x: .17, y: .3, pocketed: false },
      { id: 2, x: .83, y: .3, pocketed: false },
      { id: 8, x: .5, y: 1.8, pocketed: false },
      { id: 9, x: .9, y: 1.6, pocketed: false },
    ],
  };
  const targets = new Set<number | null>();
  const cuePositions = new Set<string>();
  for (let seed = 1; seed <= 24; seed++) {
    const choice = pool.bot(game, true, .5, seed);
    const result = pool.shoot(game, choice.shot, 'responsive', false);
    expect(result.game.lastFoul).toBe(false);
    expect(result.firstContact).not.toBe(8);
    expect(result.pocketed.some(id => id === 1 || id === 2)).toBe(true);
    targets.add(result.firstContact);
    cuePositions.add(JSON.stringify(result.game.balls.find(ball => ball.id === 0)));
  }
  expect(targets.size).toBe(2);
  expect(cuePositions.size).toBeGreaterThan(2);
});

it('varies new runtime openings and preserves the version-22 opening', () => {
  const openings = new Set<string>();
  for (let seed = 1; seed <= 12; seed++) {
    const runtime = createMatch('billiards', 1, 0, true, seed);
    const aimed = advance(runtime, runtime.animationUntil);
    expect(aimed).toEqual(advance(runtime, runtime.animationUntil));
    expect(aimed.poolAim?.actor).toBe(1);
    openings.add(JSON.stringify(aimed.poolAim));
    const legacy = createMatch('billiards', 1, 0, true, seed, 22);
    expect(advance(legacy, legacy.animationUntil).poolAim).toEqual({
      actor: 1, angle: -Math.PI / 2, power: 1,
    });
  }
  expect(openings.size).toBeGreaterThanOrEqual(4);
});

it('reduces Veronika aiming error slightly in new matches while preserving version 23', () => {
  const game: pool.Game = {
    ...pool.create(1), break: false, groups: ['stripes', 'solids'],
    balls: [
      { id: 0, x: .75, y: 1.5, pocketed: false },
      { id: 1, x: .2, y: .4, pocketed: false },
      { id: 8, x: .85, y: 1.8, pocketed: false },
      { id: 9, x: .85, y: .8, pocketed: false },
    ],
  };
  for (let seed = 1; seed <= 12; seed++) {
    const legacy = createMatch('billiards', 1, 0, true, seed, 23);
    const current = createMatch('billiards', 1, 0, true, seed);
    legacy.game = structuredClone(game);
    current.game = structuredClone(game);
    const previousAim = advance(legacy, legacy.animationUntil);
    const newAim = advance(current, current.animationUntil);
    const ideal = pool.bot(game, true, .5, previousAim.seed).shot;
    expect(newAim.seed).toBe(previousAim.seed);
    expect(newAim.poolAim!.power).toBe(previousAim.poolAim!.power);
    expect(newAim.poolAim!.angle - ideal.angle).toBeCloseTo((previousAim.poolAim!.angle - ideal.angle) * .9, 12);
    expect(Math.abs(newAim.poolAim!.angle - ideal.angle)).toBeLessThan(Math.abs(previousAim.poolAim!.angle - ideal.angle));
    expect(newAim).toEqual(advance(current, current.animationUntil));
  }
});

it('preserves the version-23 aiming choice for an existing match', () => {
  const runtime = createMatch('billiards', 1, 0, true, 4, 23);
  runtime.game = {
    ...pool.create(1), break: false, groups: ['stripes', 'solids'],
    balls: [
      { id: 0, x: .75, y: 1.5, pocketed: false },
      { id: 1, x: .2, y: .4, pocketed: false },
      { id: 8, x: .85, y: 1.8, pocketed: false },
      { id: 9, x: .85, y: .8, pocketed: false },
    ],
  };
  const aim = advance(runtime, runtime.animationUntil).poolAim!;
  expect(aim.actor).toBe(1);
  expect(aim.angle).toBeCloseTo(-2.027851821278933, 12);
  expect(aim.power).toBeCloseTo(.6050142752749559, 12);
});
