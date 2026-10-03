import { describe, expect, it } from 'vitest';
import { resolveBeachCourtShot } from './beachCourtShot.js';
import { resolvePerspectiveCourtShot, getPerspectiveCourtGoalieHitbox } from './court/perspective.js';
import { GOALIES } from './balance/goalies.js';
import { STICK_NEUTRAL } from './shot/types.js';
import { PUCK_START } from './rink.js';
import { GOALIE_Y } from './goalie/types.js';
const input = { tapTime: 2000, shooterMotionTime: 250, puckSpeedPerMs: 1, shooterFrequency: 1 };
const cfg = GOALIES[0]!;
const puddle = { id: 'water', x: 286, y: 300, radiusX: 200, radiusY: 50, deepRatio: 1, speedMultiplier: 0.5 };
describe('beach perspective shot', () => {
  it('keeps the original resolver result when no water is crossed', () => {
    expect(resolveBeachCourtShot(input, cfg, 'seed', 0, []).result)
      .toEqual(resolvePerspectiveCourtShot(input, cfg, 'seed', 0, STICK_NEUTRAL));
  });
  it('does not allow a goalie save or goal beyond earlier deep water', () => {
    const shot = resolveBeachCourtShot(input, cfg, 'seed', 0, [puddle]);
    expect(shot.blockedByWater).toBe(true);
    expect(shot.result.type).toBe('miss');
    expect(shot.flight.stopY).toBe(350);
  });
  it('preserves a goalie save that precedes deep water behind the goalie', () => {
    const staticGoalie = { ...cfg, amplitude: 0, goalAmplitude: 0 };
    const shot = resolveBeachCourtShot(input, staticGoalie, 'seed', 0,
      [{ ...puddle, y: 65, radiusY: 10 }]);
    expect(shot.result.type).toBe('save');
    expect(shot.blockedByWater).toBe(false);
    expect(shot.flight.stopY).toBe(GOALIE_Y);
    expect(shot.flight.durationMs).toBeCloseTo((PUCK_START.y - GOALIE_Y) / input.puckSpeedPerMs);
  });
  it('samples the existing goalie hitbox at the explicitly derived crossing time', () => {
    const hitbox = getPerspectiveCourtGoalieHitbox(input, cfg, 'seed', 0, STICK_NEUTRAL, undefined, 4000);
    expect(hitbox.timeMs).toBe(4000);
  });
  it('freezes the copied flight when source puddles change', () => {
    const puddles = [{ ...puddle, deepRatio: 0 }];
    const shot = resolveBeachCourtShot(input, cfg, 'seed', 0, puddles);
    const crossing = shot.flight.arrivalMsAtY(GOALIE_Y);
    puddles[0]!.speedMultiplier = 1;
    expect(shot.flight.arrivalMsAtY(GOALIE_Y)).toBe(crossing);
  });
});

it('resolves goalie and goal against their independent arrival motion clocks', () => {
  const moving = { ...cfg, amplitude: 170, goalAmplitude: 200, frequency: .6, goalFrequency: .5 };
  let differences = 0;
  for (let tapTime = 1000; tapTime < 5000; tapTime += 100) {
    const shotInput = { ...input, tapTime, shooterMotionTime: tapTime };
    const shifted = resolveBeachCourtShot(shotInput, moving, 'seed', 0, [], undefined,
      (target, time) => time - (target === 'goal' ? 1000 : 500));
    const expected = resolvePerspectiveCourtShot(shotInput, moving, 'seed', 0, STICK_NEUTRAL, undefined, {
      goalieTimeMs: tapTime + PUCK_START.y - GOALIE_Y - 500,
      goalTimeMs: tapTime + PUCK_START.y - 60 - 1000,
    });
    expect(shifted.result).toEqual(expected);
    if (shifted.result.type !== resolveBeachCourtShot(shotInput, moving, 'seed', 0, []).result.type) differences++;
  }
  expect(differences).toBeGreaterThan(0);
});
