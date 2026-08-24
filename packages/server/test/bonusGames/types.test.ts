import { describe, expect, it } from 'vitest';
import {
  buildBonusGoalieConfig,
  parseBonusPeriodRules,
  type BonusPeriodRule,
} from '../../src/bonusGames/types.js';
import { deriveBonusAttemptSeed } from '../../src/duel/seed.js';

function validRule(periodNumber: number): BonusPeriodRule {
  return {
    periodNumber,
    durationMs: 240_000,
    shotsLimit: 30,
    goalFrequency: 0.45,
    goalieFrequency: 0.5,
    shooterFrequency: 0.65,
    puckSpeedPerMs: 1.2,
    goaliePattern: 'linear',
    goalieAmplitude: 1,
    goalAmplitude: 220,
  };
}

describe('bonus game rule contracts', () => {
  it('rejects gaps in period numbering', () => {
    expect(() => parseBonusPeriodRules([validRule(1), validRule(3)], 2)).toThrow(
      'bonus periods must be contiguous',
    );
  });

  it.each([
    ['duration', { durationMs: 999 }],
    ['shots limit', { shotsLimit: 101 }],
    ['goal frequency', { goalFrequency: 3.01 }],
    ['goalie frequency', { goalieFrequency: 0.09 }],
    ['shooter frequency', { shooterFrequency: 3.01 }],
    ['puck speed', { puckSpeedPerMs: 5.01 }],
    ['goalie amplitude', { goalieAmplitude: 1.01 }],
    ['goal amplitude', { goalAmplitude: 220.01 }],
    ['goalie pattern', { goaliePattern: 'feint' }],
  ])('rejects an out-of-range %s rule', (_name, override) => {
    expect(() => parseBonusPeriodRules([{ ...validRule(1), ...override }], 1)).toThrow();
  });

  it('rejects targets larger than all shot quotas', () => {
    expect(() => parseBonusPeriodRules([validRule(1), validRule(2)], 2, 61)).toThrow(
      'target goals cannot exceed total shots limit',
    );
  });

  it('normalizes bonus puck speed to the PlayView four-decimal shot contract', () => {
    // A full-precision snapshot at this exact reviewed boundary can resolve differently from
    // PlayView, which submits and resolves the same value rounded to four decimal places.
    const [rule] = parseBonusPeriodRules([{ ...validRule(1), puckSpeedPerMs: 1.234549 }], 1);

    expect(rule?.puckSpeedPerMs).toBe(1.2345);
  });

  it('builds the exact configured goalkeeper', () => {
    const config = buildBonusGoalieConfig('beach', 'Пляж', validRule(1));

    expect(config).toMatchObject({
      id: 'bonus:beach:p1',
      name: 'Пляж',
      pattern: 'linear',
      amplitude: 1,
      goalAmplitude: 220,
      frequency: 0.5,
      goalFrequency: 0.45,
      hp: 0,
      baseReward: 0,
      firstClearBonus: 0,
      speed: 0,
    });
  });

  it('derives a stable secret-backed attempt seed', () => {
    expect(deriveBonusAttemptSeed('a1', 'u1', 'g1', 'secret')).toBe(
      '03f380f9b330f2c7522d8466aef48eefc421395c4e2f3aa2aff56438dc6e6804',
    );
    expect(deriveBonusAttemptSeed('a1', 'u1', 'g1', 'secret')).toBe(
      deriveBonusAttemptSeed('a1', 'u1', 'g1', 'secret'),
    );
  });
});
