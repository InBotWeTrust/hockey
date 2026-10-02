import { describe, expect, it } from 'vitest';
import { createBonusChallengeMotionSampler, getBonusChallengeCondition, getBonusChallengeShooterMotionTime, type BonusChallengeEnvironmentRules } from './bonusChallenge.js';

const beach: BonusChallengeEnvironmentRules = {
  fatigue: {
    slowdownStartMs: 10_000,
    heavyStartMs: 25_000,
    stopStartMs: 40_000,
    stopDurationMs: 4_000,
    recoveryDurationMs: 10_000,
    slowMultiplier: 0.85,
    heavyMultiplier: 0.65,
  },
};

describe('bonus challenge environment', () => {
  it('samples incrementally and rebases for new flights or backwards time', () => {
    const accepted = [{ tapTime: 9900, flightMs: 200 }];
    const local = [{ tapTime: 9900, flightMs: 200 }];
    const sample = createBonusChallengeMotionSampler(beach, 0.65, accepted);
    for (const time of [10000, 10100, 25000, 44000, 54000, 12000]) {
      expect(sample(time, local)).toBeCloseTo(getBonusChallengeShooterMotionTime(beach, time, 0.65, accepted), 8);
    }
    local.push({ tapTime: 13000, flightMs: 300 });
    expect(sample(14000, local)).toBeCloseTo(getBonusChallengeShooterMotionTime(beach, 14000, 0.65, local), 8);
  });

  it('integrates movement across fatigue, rest and recovery without changing the raw clock', () => {
    expect(getBonusChallengeShooterMotionTime(beach, 10_000, 0.65, [])).toBe(10_000);
    expect(getBonusChallengeShooterMotionTime(beach, 25_000, 0.65, [])).toBe(22_750);
    expect(getBonusChallengeShooterMotionTime(beach, 40_000, 0.65, [])).toBe(32_500);
    expect(getBonusChallengeShooterMotionTime(beach, 44_000, 0.65, [])).toBe(32_500);
    expect(getBonusChallengeShooterMotionTime(beach, 54_000, 0.65, [])).toBe(42_500);
  });

  it('subtracts only the part of each shot flight spent moving, including a fatigue boundary', () => {
    const pauses = [{ tapTime: 9_900, flightMs: 200 }];
    expect(getBonusChallengeShooterMotionTime(beach, 10_200, 0.65, pauses)).toBe(9_985);
    expect(getBonusChallengeShooterMotionTime(beach, 10_000, 0.65, pauses)).toBe(9_900);
  });

  it('integrates millions of short fatigue cycles analytically', () => {
    const tinyCycle = { fatigue: { slowdownStartMs: 0, heavyStartMs: 0,
      stopStartMs: 1, stopDurationMs: 1, recoveryDurationMs: 0,
      slowMultiplier: 0.85, heavyMultiplier: 0.65 } };
    expect(getBonusChallengeShooterMotionTime(tinyCycle, 10_800_000, 1, [])).toBe(3_510_000);
  }, 1000);

  it('matches a discrete reference across phases, frequency clamp and overlapping pauses', () => {
    const rules: BonusChallengeEnvironmentRules = {
      fatigue: { slowdownStartMs: 2, heavyStartMs: 4, stopStartMs: 7,
        stopDurationMs: 2, recoveryDurationMs: 3, slowMultiplier: 0.85, heavyMultiplier: 0.65 },
      speedPhases: [{ durationMs: 1000, shooterMultiplier: 0.1, puckSpeedMultiplier: 1 },
        { durationMs: 1000, shooterMultiplier: 1.2, puckSpeedMultiplier: 1 }],
      stumbleWindows: [{ startMs: 998, durationMs: 9 }],
    };
    const pauses = [{ tapTime: 990, flightMs: 12 }, { tapTime: 999, flightMs: 14 }];
    let expected = 0;
    for (let time = 0; time < 4007; time += 1) {
      const condition = getBonusChallengeCondition(rules, time + 0.5);
      if (condition.canShoot && !pauses.some((pause) => time >= pause.tapTime && time < pause.tapTime + pause.flightMs)) {
        expected += Math.max(0.1 / 0.5, condition.shooterSpeedMultiplier);
      }
    }
    expect(getBonusChallengeShooterMotionTime(rules, 4007, 0.5, pauses)).toBeCloseTo(expected, 8);
  });
  it('applies permanent environment modifiers to every moving entity', () => {
    const rules: BonusChallengeEnvironmentRules = {
      baseModifiers: {
        goalMultiplier: 1.2,
        goalieMultiplier: 1.4,
        shooterMultiplier: 0.9,
        puckSpeedMultiplier: 0.9,
        label: 'Лёд тает · игрок −10% · шайба −10%',
      },
    };

    expect(getBonusChallengeCondition(rules, 0)).toMatchObject({
      goalSpeedMultiplier: 1.2,
      goalieSpeedMultiplier: 1.4,
      shooterSpeedMultiplier: 0.9,
      puckSpeedMultiplier: 0.9,
    });
  });

  it('composes permanent, phase and fatigue modifiers multiplicatively', () => {
    const rules: BonusChallengeEnvironmentRules = {
      baseModifiers: {
        goalMultiplier: 1.1,
        goalieMultiplier: 1.08,
        shooterMultiplier: 0.9,
        puckSpeedMultiplier: 0.9,
        label: 'Штормовая качка',
      },
      ...beach,
      speedPhases: [
        { durationMs: 20_000, shooterMultiplier: 0.85, puckSpeedMultiplier: 0.9 },
        { durationMs: 20_000, shooterMultiplier: 1.2, puckSpeedMultiplier: 1.15 },
      ],
    };

    expect(getBonusChallengeCondition(rules, 15_000)).toMatchObject({
      goalSpeedMultiplier: 1.1,
      goalieSpeedMultiplier: 1.08,
      shooterSpeedMultiplier: 0.9 * 0.85 * 0.85,
      puckSpeedMultiplier: 0.9 * 0.9,
    });
  });

  it('starts beach fatigue after ten seconds and repeats after rest and recovery', () => {
    expect(getBonusChallengeCondition(beach, 9_999)).toMatchObject({
      fatigueLevel: 'none', status: 'normal', shooterSpeedMultiplier: 1, canShoot: true,
    });
    expect(getBonusChallengeCondition(beach, 10_000)).toMatchObject({
      fatigueLevel: 'medium', status: 'tired', shooterSpeedMultiplier: 0.85, canShoot: true,
    });
    expect(getBonusChallengeCondition(beach, 25_000)).toMatchObject({
      fatigueLevel: 'heavy', status: 'nutrition_slowdown', shooterSpeedMultiplier: 0.65,
    });
    expect(getBonusChallengeCondition(beach, 40_000)).toMatchObject({
      fatigueLevel: 'resting', status: 'exhausted_stop', shooterSpeedMultiplier: 0, canShoot: false,
    });
    expect(getBonusChallengeCondition(beach, 44_000)).toMatchObject({
      fatigueLevel: 'none', status: 'normal', shooterSpeedMultiplier: 1, canShoot: true,
    });
    expect(getBonusChallengeCondition(beach, 54_000)).toMatchObject({
      fatigueLevel: 'none', status: 'normal', shooterSpeedMultiplier: 1, canShoot: true,
    });
    expect(getBonusChallengeCondition(beach, 64_000)).toMatchObject({
      fatigueLevel: 'medium', status: 'tired', shooterSpeedMultiplier: 0.85, canShoot: true,
    });
  });

  it('cycles speed phases and applies them alongside fatigue', () => {
    const rules: BonusChallengeEnvironmentRules = {
      ...beach,
      speedPhases: [
        { durationMs: 20_000, shooterMultiplier: 1, puckSpeedMultiplier: 1 },
        { durationMs: 20_000, shooterMultiplier: 1.25, puckSpeedMultiplier: 1.2 },
      ],
    };

    expect(getBonusChallengeCondition(rules, 15_000)).toMatchObject({
      shooterSpeedMultiplier: 0.85,
      puckSpeedMultiplier: 1,
    });
    expect(getBonusChallengeCondition(rules, 35_000)).toMatchObject({
      shooterSpeedMultiplier: 0.8125,
      puckSpeedMultiplier: 1.2,
    });
    expect(getBonusChallengeCondition(rules, 55_000)).toMatchObject({
      shooterSpeedMultiplier: 1,
      puckSpeedMultiplier: 1,
    });
  });

  it('blocks shots during explicit stumbles but never overlays a rest', () => {
    const rules: BonusChallengeEnvironmentRules = {
      ...beach,
      stumbleWindows: [
        { startMs: 12_000, durationMs: 600 },
        { startMs: 40_100, durationMs: 600 },
      ],
    };

    expect(getBonusChallengeCondition(rules, 12_100)).toMatchObject({
      status: 'stumble', stumbleActive: true, canShoot: false,
    });
    expect(getBonusChallengeCondition(rules, 40_100)).toMatchObject({
      status: 'exhausted_stop', stumbleActive: false, canShoot: false,
    });
  });
});
