import { getAdvancedTrainingV2Side, type AdvancedTrainingV2Side,
  type AdvancedTrainingV2Technique } from './advancedTrainingV2.js';
import { classifyMarksmanshipV6Score, type MarksmanshipV6Measurements } from './marksmanshipV6.js';
import { GOALIE_Y } from './goalie/types.js';
import { GOAL_OPENING, PUCK_START } from './rink.js';
import { PUCK_SPEED_PER_MS, type ShotResult } from './shot/types.js';

/** Exercise-only motion. Match simulation and classification remain untouched. */
export interface AdvancedTrainingEpisodeProfile {
  id: string;
  technique: AdvancedTrainingV2Technique;
  side: AdvancedTrainingV2Side;
  sceneStartMs: number;
  traversalMs: number;
  intervalStartMs: number;
  intervalEndMs: number;
  episodeEndMs: number;
  puckSpeedPerMs: number;
  goalCenterX: number;
  goalieCenterX: number;
  playerTargetX: number;
  playerDirection: -1 | 1;
  goalDirection: -1 | 1;
  goalieDirection: -1 | 1;
}

export interface AdvancedTrainingEpisodeSample {
  playerX: number;
  goalieX: number;
  goalOffsetX: number;
  playerDirection: -1 | 1;
  goalieDirection: -1 | 1;
  goalDirection: -1 | 1;
}

const GOAL_WIDTH = 79.8;
const GOALIE_WIDTH = 73.76;
const RINK_CENTER_X = 286;
const PLAYER_LEFT = 50;
const PLAYER_RIGHT = 522;
const TRAVERSAL_MS = 2000;
const WINDOW_START_MS = 17_500;
const WINDOW_END_MS = 18_000;
const APPROACH_START_MS = 16_000;
const MOTION_PER_MS = 0.001;

function smoothstep(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function playerOnTraversals(timeMs: number): number {
  const phase = (timeMs % (2 * TRAVERSAL_MS)) / TRAVERSAL_MS;
  return PLAYER_LEFT + (PLAYER_RIGHT - PLAYER_LEFT) * (phase <= 1 ? phase : 2 - phase);
}

export function getAdvancedTrainingEpisode(technique: AdvancedTrainingV2Technique,
  side: AdvancedTrainingV2Side): AdvancedTrainingEpisodeProfile {
  const sign = side === 'left' ? 1 : -1;
  const goalCenterX = technique === 'corner' ? side === 'left' ? 119.9 : 452.1 : RINK_CENTER_X;
  const goalMin = goalCenterX - GOAL_WIDTH / 2;
  let goalieCenterX: number;
  let playerTargetX: number;
  if (technique === 'near_goalie' || technique === 'counter_direction') {
    goalieCenterX = goalCenterX - sign * (GOAL_WIDTH / 2 + GOALIE_WIDTH / 2 + 20);
    playerTargetX = goalCenterX;
  } else {
    const gap = technique === 'super_precise' ? 7 : technique === 'complex' ? 68 : 30;
    goalieCenterX = side === 'left'
      ? goalMin + gap + GOALIE_WIDTH / 2
      : goalCenterX + GOAL_WIDTH / 2 - gap - GOALIE_WIDTH / 2;
    const fromLeft = technique === 'edge' ? gap - 3 : technique === 'super_precise' ? 3 :
      technique === 'complex' ? 30 : 12;
    playerTargetX = side === 'left' ? goalMin + fromLeft : goalCenterX + GOAL_WIDTH / 2 - fromLeft;
  }
  const playerDirection: -1 | 1 = side === 'left' ? -1 : 1;
  const goalDirection: -1 | 1 = technique === 'counter_direction' || technique === 'behind_goalie'
    ? playerDirection === 1 ? -1 : 1 : playerDirection;
  const goalieDirection: -1 | 1 = technique === 'behind_goalie'
    ? playerDirection === 1 ? -1 : 1 : playerDirection;
  return {
    id: `episode-v1:${technique}:${side}`, technique, side, sceneStartMs: 0,
    traversalMs: TRAVERSAL_MS, intervalStartMs: WINDOW_START_MS,
    intervalEndMs: WINDOW_END_MS, episodeEndMs: WINDOW_END_MS + 300,
    puckSpeedPerMs: PUCK_SPEED_PER_MS, goalCenterX, goalieCenterX,
    playerTargetX, playerDirection, goalDirection, goalieDirection,
  };
}

export function sampleAdvancedTrainingEpisode(profile: AdvancedTrainingEpisodeProfile,
  episodeMs: number): AdvancedTrainingEpisodeSample {
  const time = Math.max(profile.sceneStartMs, episodeMs);
  const approach = smoothstep((time - APPROACH_START_MS) / (WINDOW_START_MS - APPROACH_START_MS));
  const traversingX = playerOnTraversals(time);
  const travelX = traversingX + (profile.playerTargetX - traversingX) * approach;
  const driftMs = Math.max(0, time - WINDOW_START_MS);
  const leadMotion = 1 - approach;
  const motionPhase = 2 * Math.PI * time / (4 * profile.traversalMs);
  const playerX = travelX + profile.playerDirection * MOTION_PER_MS * driftMs;
  const goalieX = profile.goalieCenterX + 38 * Math.sin(motionPhase + 0.7) * leadMotion +
    profile.goalieDirection * MOTION_PER_MS * driftMs;
  const goalOffsetX = profile.goalCenterX - RINK_CENTER_X +
    24 * Math.sin(motionPhase) * leadMotion +
    profile.goalDirection * MOTION_PER_MS * driftMs;
  return { playerX, goalieX, goalOffsetX, playerDirection: profile.playerDirection,
    goalieDirection: profile.goalieDirection, goalDirection: profile.goalDirection };
}

export function evaluateAdvancedTrainingEpisodeShot(profile: AdvancedTrainingEpisodeProfile,
  episodeMs: number): {
  result: ShotResult;
  actualTechnique: ReturnType<typeof classifyMarksmanshipV6Score>['technique'] | null;
  actualSide: AdvancedTrainingV2Side | null;
  success: boolean;
  measurements: MarksmanshipV6Measurements | null;
} {
  const atTap = sampleAdvancedTrainingEpisode(profile, episodeMs);
  const goalieAt = sampleAdvancedTrainingEpisode(profile,
    episodeMs + (PUCK_START.y - GOALIE_Y) / profile.puckSpeedPerMs);
  const goalAt = sampleAdvancedTrainingEpisode(profile,
    episodeMs + (PUCK_START.y - GOAL_OPENING.y) / profile.puckSpeedPerMs);
  const puckX = atTap.playerX;
  const goalCenter = RINK_CENTER_X + goalAt.goalOffsetX;
  const goalieMin = goalieAt.goalieX - GOALIE_WIDTH / 2;
  const goalieMax = goalieAt.goalieX + GOALIE_WIDTH / 2;
  const goalMin = goalCenter - GOAL_WIDTH / 2;
  const goalMax = goalCenter + GOAL_WIDTH / 2;
  if (puckX >= goalieMin && puckX <= goalieMax) {
    return { result: { type: 'save', goalieContact: { x: puckX, y: GOALIE_Y } },
      actualTechnique: null, actualSide: null, success: false, measurements: null };
  }
  if (puckX < goalMin || puckX > goalMax) {
    return { result: { type: 'miss', reason: 'wide' }, actualTechnique: null,
      actualSide: null, success: false, measurements: null };
  }
  const measurements: MarksmanshipV6Measurements = {
    puckX, goalMin, goalMax, goalieMin, goalieMax,
    shooterDirection: atTap.playerDirection,
    goalDirection: goalAt.goalDirection,
    goalieDirection: goalieAt.goalieDirection,
  };
  const actualTechnique = classifyMarksmanshipV6Score(measurements).technique;
  const actualSide = getAdvancedTrainingV2Side(actualTechnique, measurements);
  return { result: { type: 'goal', hitPoint: { x: puckX, y: GOAL_OPENING.y } },
    actualTechnique, actualSide,
    success: actualTechnique === profile.technique && actualSide === profile.side,
    measurements };
}

export function validateAdvancedTrainingEpisode(profile: AdvancedTrainingEpisodeProfile): void {
  if (profile.intervalStartMs - profile.sceneStartMs < 8 * profile.traversalMs ||
    profile.intervalEndMs - profile.intervalStartMs < 500) {
    throw new Error(`Advanced training episode ${profile.id} is too short`);
  }
  for (let time = profile.intervalStartMs; time <= profile.intervalEndMs; time += 1) {
    if (!evaluateAdvancedTrainingEpisodeShot(profile, time).success) {
      throw new Error(`Advanced training episode ${profile.id} is invalid at ${time}ms`);
    }
  }
}
