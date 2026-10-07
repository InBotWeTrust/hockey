import { describe, it, expect } from 'vitest';
import type { FightAction } from '@hockey/game-core';
import { fightVisualPose } from './fightVisualPose.js';
const action: FightAction = {
  player: 0,
  phaseId: 0,
  seq: 1,
  kind: 'attack',
  zone: 'head',
  effectiveAtMs: 1000,
  activeAtMs: 1150,
  activeUntilMs: 1350,
  busyUntilMs: 1750,
  resolved: false,
};
describe('one visual strike per confirmed contact', () => {
  it('shows the target during windup and does not replay the strike on confirmation', () => {
    expect(fightVisualPose(action, 1100)).toBe('windup_head');
    expect(fightVisualPose(action, 1400)).toBe('windup_head');
    expect(fightVisualPose({ ...action, resolved: true }, 1500)).toBe('attack_head');
    expect(fightVisualPose({ ...action, resolved: true }, 1700)).toBe('attack_head');
    expect(fightVisualPose({ ...action, resolved: true }, 1800)).toBe('idle');
  });
  it('raises a guard immediately and ends it at its active deadline', () => {
    const guard = { ...action, kind: 'block' as const };
    expect(fightVisualPose(guard, 1100)).toBe('block_head');
    expect(fightVisualPose(guard, 1400)).toBe('idle');
  });
});
