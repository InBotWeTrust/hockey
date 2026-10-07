import { describe, expect, it } from 'vitest';
import { advanceFight, createFightState } from '../src/fight/engine.js';
import { fightPositionsAt, FIGHT_MOVE_LEASE_MS } from '../src/fight/movement.js';
import { DEFAULT_FIGHT_RULES } from '../src/fight/config.js';
import type { FightCommand } from '../src/fight/types.js';
const attack = (at: number): FightCommand => ({
  player: 0,
  kind: 'attack',
  zone: 'head',
  phaseId: 0,
  seq: 1,
  effectiveAtMs: at,
});
const move = (player: 0 | 1, direction: -1 | 0 | 1, at: number, seq = 1): FightCommand => ({
  player,
  kind: 'move',
  direction,
  phaseId: 0,
  seq,
  effectiveAtMs: at,
});
describe('fight distance', () => {
  it('lets the defender retreat during a visible windup and makes the attack miss', () => {
    const initial = createFightState(DEFAULT_FIGHT_RULES, 0);
    const result = advanceFight(initial, [attack(1000), move(1, -1, 1100)], 2000);
    expect(result.state.hp).toEqual([4, 4]);
    expect(result.state.actions[0]?.outcome).toBe('miss');
  });
  it('hits from the initial close distance', () => {
    expect(
      advanceFight(createFightState(DEFAULT_FIGHT_RULES, 0), [attack(1000)], 2000).state.hp,
    ).toEqual([4, 3]);
  });
  it('allows a matching block after the attacker has started winding up', () => {
    const block: FightCommand = {
      player: 1,
      kind: 'block',
      zone: 'head',
      phaseId: 0,
      seq: 1,
      effectiveAtMs: 1400,
    };
    const result = advanceFight(
      createFightState(DEFAULT_FIGHT_RULES, 0),
      [attack(1000), block],
      2000,
    );
    expect(result.state.hp).toEqual([4, 4]);
    expect(result.state.actions.find((a) => a.kind === 'attack')?.outcome).toBe('blocked');
  });
  it('stopping a retreat leaves both positions stable and is independent of delivery batching', () => {
    const initial = createFightState(DEFAULT_FIGHT_RULES, 0);
    const commands = [move(1, -1, 100), move(1, 0, 300, 2), attack(1000)];
    const batch = advanceFight(initial, commands, 2000).state;
    const first = advanceFight(initial, commands.slice(0, 1), 150).state;
    const second = advanceFight(first, commands.slice(1), 2000).state;
    expect(second).toEqual(batch);
    expect(batch.hp).toEqual([4, 4]);
  });
});

it('limits movement at the arena edges and never lets fighters pass each other', () => {
  const initial = createFightState(DEFAULT_FIGHT_RULES, 0);
  const away = advanceFight(initial, [move(0, -1, 0), move(1, -1, 0)], 400).state;
  const [left, right] = fightPositionsAt(away, 400);
  expect(left).toBeGreaterThanOrEqual(0.25);
  expect(right).toBeLessThanOrEqual(0.75);
  const close = advanceFight(initial, [move(0, 1, 0), move(1, 1, 0)], 400).state;
  const [a, b] = fightPositionsAt(close, 400);
  expect(b - a).toBeCloseTo(0.34);
});
it('expires movement when a connection disappears', () => {
  const state = advanceFight(createFightState(DEFAULT_FIGHT_RULES, 0), [move(0, -1, 0)], 0).state;
  expect(fightPositionsAt(state, FIGHT_MOVE_LEASE_MS)).toEqual(fightPositionsAt(state, 3000));
});
it('stops movement during attack and halves its speed during an active block', () => {
  const initial = createFightState(DEFAULT_FIGHT_RULES, 0);
  const normal = advanceFight(initial, [move(0, -1, 100)], 300).state;
  const guarding = advanceFight(
    initial,
    [
      move(0, -1, 100),
      { player: 0, kind: 'block', zone: 'head', effectiveAtMs: 100, phaseId: 0, seq: 2 },
    ],
    300,
  ).state;
  const attacking = advanceFight(
    initial,
    [move(0, -1, 100), { ...attack(100), seq: 2 }],
    300,
  ).state;
  expect(fightPositionsAt(attacking, 300)[0]).toBe(0.32);
  expect(0.32 - fightPositionsAt(guarding, 300)[0]).toBeCloseTo(
    (0.32 - fightPositionsAt(normal, 300)[0]) / 2,
  );
});
it('preserves input state and forgets movement at the next fight phase', () => {
  const initial = createFightState(DEFAULT_FIGHT_RULES, 0);
  const before = JSON.stringify(initial);
  const state = advanceFight(initial, [move(0, -1, 100)], 15000).state;
  expect(JSON.stringify(initial)).toBe(before);
  expect(state.moves).toEqual([]);
  expect(fightPositionsAt(state, state.phaseStartedAtMs)).toEqual([0.32, 0.68]);
});

it('starts new fights with four health points', () => {
  expect(createFightState(DEFAULT_FIGHT_RULES, 0).hp).toEqual([4, 4]);
});
it('freezes skating once the fight has a result', () => {
  const initial = createFightState(DEFAULT_FIGHT_RULES, 0);
  initial.hp = [4, 1];
  const state = advanceFight(
    initial,
    [move(0, 1, 0), { ...attack(1000), seq: 2 }, move(0, -1, 1400, 3)],
    2000,
  ).state;
  expect(state.status).toBe('resolved');
  expect(fightPositionsAt(state, 1600)).toEqual(fightPositionsAt(state, 10000));
});
