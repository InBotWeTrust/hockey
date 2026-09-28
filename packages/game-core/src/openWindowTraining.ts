import { getDailyPeriodSpeedPreset } from './balance/periods.js';
import { getGoalie } from './balance/goalies.js';
import { simulateGoal } from './goal/simulate.js';
import { simulateGoalie } from './goalie/simulate.js';
import { deriveShotSeed, getSessionPhaseOffsets } from './session.js';
import { simulateShooter } from './shooter/simulate.js';
import { resolveShot } from './shot/resolve.js';
import { STICK_NEUTRAL, type ShotResult } from './shot/types.js';

export interface OpenWindowScene {
  id: string;
  sessionSeed: string;
  shotIndex: number;
  goalieId: string;
  startMs: number;
  endMs: number;
  targetMs: number;
  bankVersion: number;
  gameCoreVersion: number;
}

export interface OpenWindowFrame {
  shooterX: number;
  goalOffsetX: number;
  goalieX: number;
}

export interface OpenWindowInterval {
  startMs: number;
  endMs: number;
}

export type OpenWindowDecision = { type: 'shot'; tapTimeMs: number } | { type: 'skip' };

export interface OpenWindowDecisionEvaluation {
  opportunity: 'shot_window' | 'blocked_path' | 'sensible_skip' | 'missed_opportunity';
  timing: 'on_time' | 'early' | 'late' | null;
  relevant: boolean;
  onTime: boolean;
  result: ShotResult['type'] | null;
}

const RECOGNITION_TOLERANCE_MS = 100;
const SKIP_WORTHWHILE_WINDOW_MS = 160;

export function sampleOpenWindowScene(scene: OpenWindowScene, timeMs: number): OpenWindowFrame {
  const speeds = getDailyPeriodSpeedPreset(1);
  const offsets = getSessionPhaseOffsets(scene.sessionSeed);
  const baseGoalie = getGoalie(scene.goalieId);
  const goalie = { ...baseGoalie, frequency: speeds.goalieFrequency,
    goalFrequency: speeds.goalFrequency };
  const shotSeed = deriveShotSeed(scene.sessionSeed, 1, scene.shotIndex);
  return {
    shooterX: simulateShooter(timeMs + offsets.shooter, speeds.shooterFrequency).x,
    goalOffsetX: simulateGoal(goalie, timeMs, offsets.goal).offsetX,
    goalieX: simulateGoalie(goalie, shotSeed, scene.shotIndex, timeMs, offsets.goalie).position.x,
  };
}

export function resolveOpenWindowShot(scene: OpenWindowScene, tapTimeMs: number): ShotResult {
  const speeds = getDailyPeriodSpeedPreset(1);
  return resolveShot({
    tapTime: tapTimeMs,
    shooterTapTime: tapTimeMs,
    shooterFrequency: speeds.shooterFrequency,
    goalieFrequency: speeds.goalieFrequency,
    goalFrequency: speeds.goalFrequency,
    puckSpeedPerMs: speeds.puckSpeedPerMs,
  }, getGoalie(scene.goalieId), deriveShotSeed(scene.sessionSeed, 1, scene.shotIndex),
  scene.shotIndex, STICK_NEUTRAL, getSessionPhaseOffsets(scene.sessionSeed));
}

export function scanOpenWindows(scene: OpenWindowScene, startMs: number,
  endMs: number): OpenWindowInterval[] {
  if (!Number.isInteger(startMs) || !Number.isInteger(endMs) || startMs < 0 || endMs < startMs) {
    throw new RangeError('Invalid open-window scan range');
  }
  const intervals: OpenWindowInterval[] = [];
  let openStart: number | null = null;
  for (let timeMs = startMs; timeMs <= endMs; timeMs += 1) {
    const isGoal = resolveOpenWindowShot(scene, timeMs).type === 'goal';
    if (isGoal && openStart === null) openStart = timeMs;
    if (!isGoal && openStart !== null) {
      intervals.push({ startMs: openStart, endMs: timeMs - 1 });
      openStart = null;
    }
  }
  if (openStart !== null) intervals.push({ startMs: openStart, endMs });
  return intervals;
}

export function evaluateOpenWindowDecision(scene: OpenWindowScene,
  decision: OpenWindowDecision, intervals: readonly OpenWindowInterval[]):
  OpenWindowDecisionEvaluation {
  if (decision.type === 'skip') {
    const missed = intervals.some((interval) =>
      interval.endMs - interval.startMs + 1 >= SKIP_WORTHWHILE_WINDOW_MS);
    return { opportunity: missed ? 'missed_opportunity' : 'sensible_skip',
      timing: null, relevant: false, onTime: false, result: null };
  }
  const result = resolveOpenWindowShot(scene, decision.tapTimeMs).type;
  let nearest: OpenWindowInterval | null = null;
  let distance = Infinity;
  for (const interval of intervals) {
    const delta = decision.tapTimeMs < interval.startMs
      ? interval.startMs - decision.tapTimeMs
      : decision.tapTimeMs > interval.endMs ? decision.tapTimeMs - interval.endMs : 0;
    if (delta < distance) {
      distance = delta;
      nearest = interval;
    }
  }
  const relevant = distance <= RECOGNITION_TOLERANCE_MS;
  const onTime = distance === 0;
  const timing = !relevant || nearest === null ? null
    : onTime ? 'on_time'
      : decision.tapTimeMs < nearest.startMs ? 'early' : 'late';
  return { opportunity: relevant ? 'shot_window' : 'blocked_path', timing,
    relevant, onTime, result };
}
