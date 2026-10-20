import { describe, expect, it } from 'vitest';
import { createFightState, advanceFight } from '../src/fight/engine.js';
// Persisted v1 fights must finish with their original timing.
const DEFAULT_FIGHT_RULES = {
  version: 1,
  initialHp: 3,
  mainDurationMs: 15000,
  suddenDeathDurationMs: 10000,
  windupMs: 150,
  activeMs: 200,
  attackRecoveryMs: 400,
  blockMs: 700,
  blockRecoveryMs: 350,
  deliveryGraceMs: 150,
};
import type { FightCommand, FightState } from '../src/fight/types.js';

function command(
  player: 0 | 1,
  at: number,
  kind: 'attack' | 'block' = 'attack',
  zone: 'head' | 'body' = 'head',
  seq = 1,
): FightCommand {
  return { player, effectiveAtMs: at, kind, zone, seq, phaseId: 0 };
}
function run(commands: FightCommand[], through = 1000, hp?: [number, number]): FightState {
  const initial = createFightState(DEFAULT_FIGHT_RULES, 0);
  return advanceFight(hp ? { ...initial, hp } : initial, commands, through).state;
}

describe('persisted v1 fight compatibility', () => {
  it('starts with equal three HP and no equipment modifiers', () => {
    expect(createFightState(DEFAULT_FIGHT_RULES, 0).hp).toEqual([3, 3]);
  });
  it.each(['head', 'body'] as const)('damages an open %s once', (zone) => {
    expect(run([command(0, 0, 'attack', zone)]).hp).toEqual([3, 2]);
  });
  it('does not confirm a hit until its group closes', () => {
    expect(run([command(0, 0)], 349).hp).toEqual([3, 3]);
    expect(run([command(0, 0)], 350).hp).toEqual([3, 2]);
  });
  it('matching block prevents damage, another zone does not', () => {
    expect(run([command(0, 0), command(1, 100, 'block')]).hp).toEqual([3, 3]);
    expect(run([command(0, 0), command(1, 100, 'block', 'body')]).hp).toEqual([3, 2]);
  });
  it('checks block at the exact impact boundary', () => {
    expect(run([command(0, 1000), command(1, 1150, 'block')], 1500).hp).toEqual([3, 3]);
    expect(run([command(0, 1000), command(1, 1151, 'block')], 1500).hp).toEqual([3, 2]);
    expect(run([command(0, 550), command(1, 0, 'block')]).hp).toEqual([3, 2]);
  });
  it('rejects input during attack recovery and allows its exact end', () => {
    expect(run([command(0, 0), command(0, 749, 'attack', 'body', 2)], 1200).hp).toEqual([3, 2]);
    expect(run([command(0, 0), command(0, 750, 'attack', 'body', 2)], 1200).hp).toEqual([3, 1]);
  });
  it('rejects attacks during block recovery', () => {
    expect(run([command(0, 0, 'block'), command(0, 1049, 'attack', 'head', 2)], 1500).hp).toEqual([
      3, 3,
    ]);
    expect(run([command(0, 0, 'block'), command(0, 1050, 'attack', 'head', 2)], 1500).hp).toEqual([
      3, 2,
    ]);
  });
  it('trades overlapping hits even if the first would be lethal', () => {
    const state = run([command(0, 1000), command(1, 1100)], 1350, [1, 1]);
    expect(state.status).toBe('sudden_death');
    expect(state.hp).toEqual([1, 1]);
    expect(state.phaseId).toBe(1);
  });
  it('does not trade merely touching windows after a lethal hit', () => {
    const state = run([command(0, 1000), command(1, 1200)], 1550, [1, 1]);
    expect(state.status).toBe('resolved');
    expect(state.winner).toBe(0);
  });
  it('an ordinary nonlethal trade damages both exactly once', () => {
    expect(run([command(0, 1000), command(1, 1100)], 1350).hp).toEqual([2, 2]);
  });
  it('resolves higher HP after the main deadline', () => {
    const state = run([command(0, 0)], 15000);
    expect(state.status).toBe('resolved');
    expect(state.winner).toBe(0);
  });
  it('equal HP enters sudden death and eventually cancels without a winner', () => {
    const sd = run([], 15000);
    expect(sd.status).toBe('sudden_death');
    expect(sd.hp).toEqual([1, 1]);
    const end = advanceFight(sd, [], sd.deadlineMs).state;
    expect(end.status).toBe('cancelled');
    expect(end.winner).toBeNull();
  });
  it('sudden death double KO restores HP without extending the deadline', () => {
    const sd = run([], 15000);
    const cmds = [command(0, sd.phaseStartedAtMs), command(1, sd.phaseStartedAtMs + 100)].map(
      (c) => ({ ...c, phaseId: sd.phaseId }),
    );
    const next = advanceFight(sd, cmds, sd.phaseStartedAtMs + 350).state;
    expect(next.status).toBe('sudden_death');
    expect(next.hp).toEqual([1, 1]);
    expect(next.deadlineMs).toBe(sd.deadlineMs);
  });
  it('resolves both eligible hits before comparing HP at 15 seconds', () => {
    const state = run([command(0, 14750), command(1, 14840)], 15000, [1, 1]);
    expect(state.status).toBe('sudden_death');
    expect(state.hp).toEqual([1, 1]);
  });
  it('excludes an impact exactly on the phase deadline', () => {
    const state = run([command(0, 14750), command(1, 14850)], 15000, [1, 1]);
    expect(state.status).toBe('resolved');
    expect(state.winner).toBe(0);
  });
  it('ignores old phase commands after sudden death begins', () => {
    const sd = run([], 15000);
    const next = advanceFight(
      sd,
      [command(0, sd.phaseStartedAtMs)],
      sd.phaseStartedAtMs + 1000,
    ).state;
    expect(next.hp).toEqual([1, 1]);
  });
  it('never repeats damage when advancing or receiving a duplicate', () => {
    const c = command(0, 0);
    const first = run([c]);
    expect(advanceFight(first, [c], 2000).state.hp).toEqual([3, 2]);
  });
  it('uses timestamps rather than delivery order for a trade', () => {
    const a = command(0, 1000);
    const b = command(1, 1100);
    expect(run([a, b], 1500)).toEqual(run([b, a], 1500));
  });
  it('preserves pending groups across incremental advances', () => {
    const initial = createFightState(DEFAULT_FIGHT_RULES, 0);
    const waiting = advanceFight(initial, [command(0, 1000)], 1200).state;
    const done = advanceFight(waiting, [command(1, 1100)], 1350).state;
    expect(done.hp).toEqual([2, 2]);
    expect(initial.hp).toEqual([3, 3]);
  });
});
