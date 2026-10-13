import { traceBeachPuckFlight, type BeachPuddle, type BeachPuckFlight } from './beachEnvironment.js';
import { resolvePerspectiveCourtShot } from './court/perspective.js';
import type { GoalieConfig } from './goalie/types.js';
import { GOALIE_Y } from './goalie/types.js';
import { PUCK_START, GOAL_OPENING } from './rink.js';
import { simulateShooter } from './shooter/simulate.js';
import { STICK_NEUTRAL, PUCK_SPEED_PER_MS, type ShotInput, type ShotResult } from './shot/types.js';
import type { SessionPhaseOffsets } from './session.js';

/** Reuses the ordinary perspective collision rules with independently derived arrival times. */
export function resolveBeachCourtShot(
  input: ShotInput,
  goalie: GoalieConfig,
  seed: string,
  shotIndex: number,
  puddles: readonly BeachPuddle[],
  phaseOffsets?: SessionPhaseOffsets,
  motionClock?: (target: 'goal' | 'goalie', sceneMs: number) => number,
): { result: ShotResult; blockedByWater: boolean; flight: BeachPuckFlight } {
  const shooterTime = input.shooterMotionTime ?? input.shooterTapTime ?? input.tapTime;
  const x = simulateShooter(shooterTime + (phaseOffsets?.shooter ?? 0), input.shooterFrequency).x;
  const flight = traceBeachPuckFlight({ x, startY: PUCK_START.y, endY: GOAL_OPENING.y,
    speedPerMs: input.puckSpeedPerMs ?? PUCK_SPEED_PER_MS, puddles });
  const goalieArrival = flight.arrivalMsAtY(GOALIE_Y);
  const goalArrival = flight.arrivalMsAtY(GOAL_OPENING.y);
  if (goalieArrival === null) {
    return { result: { type: 'miss', reason: 'wide' }, blockedByWater: true, flight };
  }
  const result = resolvePerspectiveCourtShot(input, goalie, seed, shotIndex, STICK_NEUTRAL, phaseOffsets, {
    goalieTimeMs: motionClock?.('goalie', input.tapTime + goalieArrival) ?? input.tapTime + goalieArrival,
    // This time is never used as a valid goal when deep water blocked that crossing.
    goalTimeMs: motionClock?.('goal', input.tapTime + (goalArrival ?? flight.durationMs)) ?? input.tapTime + (goalArrival ?? flight.durationMs),
  });
  if (result.type !== 'save' && flight.blocked) {
    return { result: { type: 'miss', reason: 'wide' }, blockedByWater: true, flight };
  }
  const resolvedFlight = result.type === 'save'
    ? traceBeachPuckFlight({ x, startY: PUCK_START.y, endY: GOALIE_Y,
      speedPerMs: input.puckSpeedPerMs ?? PUCK_SPEED_PER_MS, puddles })
    : flight;
  return { result, blockedByWater: false, flight: resolvedFlight };
}
