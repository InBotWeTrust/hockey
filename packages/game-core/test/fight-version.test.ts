import { expect, it } from 'vitest';
import { createFightState, advanceFight } from '../src/fight/engine.js';
import { DEFAULT_FIGHT_RULES } from '../src/fight/config.js';
it('new fights use responsive v3 timing while explicit v2 keeps saved rules', () => {
  expect(DEFAULT_FIGHT_RULES.version).toBe(3);
  expect(DEFAULT_FIGHT_RULES.windupMs).toBe(250);
  const rules = { ...DEFAULT_FIGHT_RULES, version: 2, windupMs: 500, attackRecoveryMs: 300 };
  const initial = createFightState(rules, 0);
  const cmd = { player: 0 as const, phaseId: 0, seq: 1, kind: 'attack' as const, zone: 'head' as const, effectiveAtMs: 0 };
  const waiting = advanceFight(initial, [cmd], 599).state;
  expect(waiting.hp).toEqual([4,4]);
  expect(advanceFight(waiting, [], 600).state.hp).toEqual([4,3]);
  expect(initial.actions).toEqual([]);
});
