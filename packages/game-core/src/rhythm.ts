import {
  getDuelPlayerCondition,
  DUEL_STUMBLE_HOLD_MS,
  createDuelStumbleRandomness,
  DEFAULT_DUEL_INVENTORY_TIMING,
  type DuelPlayerConditionInput,
} from './duelInventory.js';

export interface RhythmShot {
  travel: number;
  goal: boolean;
}
export interface RhythmProjection {
  score: number;
  currentSeries: number;
  series: number[];
  remainingTraversals: number;
  lastGoalTravel: number;
}
/** Travel is cumulative, in board-to-board widths; it never includes frozen time. */
export function projectRhythm(input: {
  shots: readonly RhythmShot[];
  travel: number;
}): RhythmProjection {
  let score = 0,
    currentSeries = 0,
    lastGoalTravel = 0;
  const finished: number[] = [];
  for (const shot of input.shots) {
    if (shot.travel - lastGoalTravel > 2 && currentSeries > 0) {
      finished.push(currentSeries);
      currentSeries = 0;
    }
    if (!shot.goal) continue;
    if (shot.travel - lastGoalTravel <= 2) {
      score++;
      currentSeries++;
    }
    lastGoalTravel = shot.travel;
  }
  const remainingTraversals = Math.max(0, 2 - (input.travel - lastGoalTravel));
  if (input.travel - lastGoalTravel > 2 && currentSeries > 0) {
    finished.push(currentSeries);
    currentSeries = 0;
  }
  return {
    score,
    currentSeries,
    series: [...finished, ...(currentSeries ? [currentSeries] : [])].sort((a, b) => b - a),
    remainingTraversals,
    lastGoalTravel,
  };
}
export function compareRhythmSeries(a: readonly number[], b: readonly number[]): number {
  const left = [...a].sort((x, y) => y - x),
    right = [...b].sort((x, y) => y - x);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0);
    if (delta) return Math.sign(delta);
  }
  return 0;
}
export interface RhythmFlightPause {
  tapTime: number;
  flightMs: number;
}
/** Same fixed-step motion integral drives the existing renderer hook and server shots.
 * Scene time already excludes result modals. Flight intervals exclude shooter motion.
 * Cached full steps make interpolation independent of frame rate and request order. */
export function createRhythmMovementSampler(input: DuelPlayerConditionInput) {
  const stepMs = 10,
    motion = [0],
    stumbleHolds = [0];
  let pauseKey = '';
  let pauses: readonly RhythmFlightPause[] = [];
  const frequency = input.currentShooterSpeed;
  const stumbleRandomness =
    input.stumbleRandomness ??
    createDuelStumbleRandomness(
      input,
      input.loadout.fallbackSkatesTiming ?? DEFAULT_DUEL_INVENTORY_TIMING,
    );
  const rawConditionAt = (time: number) =>
    getDuelPlayerCondition({
      ...input,
      stumbleRandomness,
      elapsedMs: time,
      // Inventory uses its existing consumption model; scoring uses integrated motion below.
      movementDistancePx: (time * frequency * 2 * input.baseLaneWidthPx) / 1000,
    });
  const advance = (start: number, end: number, previous: number, heldUntil: number) => {
    const c = rawConditionAt(start);
    const stumbleUntil = c.stumbleActive ? start + DUEL_STUMBLE_HOLD_MS : heldUntil;
    if (start < stumbleUntil || c.status === 'exhausted_stop')
      return { motion: previous, stumbleUntil };
    let active = end - start;
    for (const pause of pauses)
      active -= Math.max(
        0,
        Math.min(end, pause.tapTime + pause.flightMs) - Math.max(start, pause.tapTime),
      );
    return {
      motion:
        previous +
        (Math.max(0, active) * Math.max(0.1, Math.min(3, frequency * c.shooterSpeedMultiplier))) /
          Math.max(0.1, frequency),
      stumbleUntil,
    };
  };
  const motionAt = (sceneMs: number, flightPauses: readonly RhythmFlightPause[] = []): number => {
    const key = flightPauses.map((p) => `${p.tapTime}:${p.flightMs}`).join('|');
    if (key !== pauseKey) {
      let firstChanged = Infinity;
      for (let i = 0; i < Math.max(pauses.length, flightPauses.length); i++) {
        const previous = pauses[i],
          next = flightPauses[i];
        if (previous?.tapTime !== next?.tapTime || previous?.flightMs !== next?.flightMs) {
          firstChanged = Math.min(
            firstChanged,
            previous?.tapTime ?? Infinity,
            next?.tapTime ?? Infinity,
          );
        }
      }
      motion.length = Math.min(motion.length, Math.floor(Math.max(0, firstChanged) / stepMs) + 1);
      stumbleHolds.length = motion.length;
      pauseKey = key;
      pauses = flightPauses.map((pause) => ({ ...pause }));
    }
    const time = Math.min(150000, Math.max(0, sceneMs)),
      index = Math.floor(time / stepMs);
    while (motion.length <= index) {
      const i = motion.length - 1;
      const next = advance(i * stepMs, (i + 1) * stepMs, motion[i]!, stumbleHolds[i]!);
      motion.push(next.motion);
      stumbleHolds.push(next.stumbleUntil);
    }
    return advance(index * stepMs, time, motion[index]!, stumbleHolds[index]!).motion;
  };
  return {
    motionAt,
    travelAt: (sceneMs: number, flightPauses: readonly RhythmFlightPause[] = []) =>
      (motionAt(sceneMs, flightPauses) * frequency * 2) / 1000,
    conditionAt: (sceneMs: number, flightPauses: readonly RhythmFlightPause[] = pauses) => {
      const time = Math.min(150000, Math.max(0, sceneMs));
      motionAt(time, flightPauses);
      const c = rawConditionAt(time);
      return !c.stumbleActive &&
        c.status !== 'exhausted_stop' &&
        time < stumbleHolds[Math.floor(time / stepMs)]!
        ? { ...c, canShoot: false, stumbleActive: true, status: 'stumble' as const }
        : c;
    },
  };
}
