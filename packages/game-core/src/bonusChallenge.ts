import { beachFatigueState, beachMeltMultiplier, beachStumbleAllowed, integrateBeachMovement } from './beachCondition.js';
import type { WindGust } from './beachWind.js';
import type { BeachPuddleRule } from './beachEnvironment.js';
import type { SkiEnvironmentRules } from './skiEnvironment.js';
import type { DuelPlayerCondition } from './duelInventory.js';

export interface BonusChallengeFatigueRules {
  slowdownStartMs: number;
  heavyStartMs: number;
  stopStartMs: number;
  stopDurationMs: number;
  recoveryDurationMs: number;
  slowMultiplier: number;
  heavyMultiplier: number;
}

export interface BonusChallengeStumbleWindow {
  startMs: number;
  durationMs: number;
}

export interface BonusChallengeSpeedPhase {
  durationMs: number;
  shooterMultiplier: number;
  puckSpeedMultiplier: number;
}

export interface BonusChallengeBaseModifiers {
  goalMultiplier: number;
  goalieMultiplier: number;
  shooterMultiplier: number;
  puckSpeedMultiplier: number;
  label: string;
}

export interface BonusChallengeEnvironmentRules {
  ski?: SkiEnvironmentRules;
  beach?: {
    version: 1;
    interactive?: { version: 1; wind: WindGust[] } | undefined;
    meltDurationMs: number;
    finalSpeedMultiplier: number;
    puddles: BeachPuddleRule[];
  };
  baseModifiers?: BonusChallengeBaseModifiers;
  fatigue?: BonusChallengeFatigueRules;
  stumbleWindows?: BonusChallengeStumbleWindow[];
  speedPhases?: BonusChallengeSpeedPhase[];
}

export interface BonusChallengeCondition extends DuelPlayerCondition {
  goalSpeedMultiplier: number;
  goalieSpeedMultiplier: number;
  puckSpeedMultiplier: number;
}

export interface BonusChallengeShotPause {
  tapTime: number;
  flightMs: number;
}

/** Integrate distance, not wall-clock phase: speed changes never teleport the shooter.
 * Shot flights freeze only the shooter; rest/stumbles contribute zero movement.
 */
export function getBonusChallengeShooterMotionTime(
  rules: BonusChallengeEnvironmentRules,
  elapsedMs: number,
  shooterFrequency: number,
  pauses: readonly BonusChallengeShotPause[],
  fromElapsedMs = 0,
): number {
  const end = Math.max(0, elapsedMs);
  const begin = Math.min(end, Math.max(0, fromElapsedMs));
  const boundaries = new Set([begin, end]);
  const add = (value: number): void => { if (value > begin && value < end) boundaries.add(value); };
  const fatigue = rules.fatigue;
  // Integrate complete fatigue cycles analytically: legal cycles can be 1 ms.
  const integrate = (time: number, multiplier: number): number => {
    const rate = (factor: number): number => Math.max(0.1 / shooterFrequency, multiplier * factor);
    if (!fatigue) return time * rate(1);
    const cycle = Math.max(1, fatigue.stopStartMs + fatigue.stopDurationMs + fatigue.recoveryDurationMs);
    const offsets = [...new Set([0, fatigue.slowdownStartMs, fatigue.heavyStartMs,
      fatigue.stopStartMs, fatigue.stopStartMs + fatigue.stopDurationMs, cycle])]
      .filter((value) => value >= 0 && value <= cycle).sort((a, b) => a - b);
    const area = (limit: number): number => {
      let total = 0;
      for (let index = 1; index < offsets.length; index += 1) {
        const start = offsets[index - 1]!;
        const finish = Math.min(limit, offsets[index]!);
        if (finish <= start) continue;
        if (start >= fatigue.stopStartMs && start < fatigue.stopStartMs + fatigue.stopDurationMs) continue;
        const recovering = start >= fatigue.stopStartMs + fatigue.stopDurationMs;
        const factor = recovering ? 1 : start >= fatigue.heavyStartMs ? fatigue.heavyMultiplier
          : start >= fatigue.slowdownStartMs ? fatigue.slowMultiplier : 1;
        total += (finish - start) * rate(factor);
      }
      return total;
    };
    return Math.floor(time / cycle) * area(cycle) + area(time % cycle);
  };
  if (rules.speedPhases?.length) {
    const cycle = rules.speedPhases.reduce((sum, phase) => sum + Math.max(1, phase.durationMs), 0);
    for (let start = Math.floor(begin / cycle) * cycle; start < end; start += cycle) {
      let cursor = start;
      for (const phase of rules.speedPhases) { add(cursor); cursor += Math.max(1, phase.durationMs); }
    }
  }
  for (const window of rules.stumbleWindows ?? []) {
    if (!beachStumbleAllowed(rules, window)) continue;
    add(window.startMs); add(window.startMs + window.durationMs);
  }
  for (const pause of pauses) { add(pause.tapTime); add(pause.tapTime + pause.flightMs); }
  const sorted = [...boundaries].sort((a, b) => a - b);
  const orderedPauses = [...pauses].sort((a, b) => a.tapTime - b.tapTime);
  let pauseIndex = 0;
  let pauseEnd = -Infinity;
  let motion = 0;
  for (let index = 1; index < sorted.length; index += 1) {
    const start = sorted[index - 1]!;
    const finish = sorted[index]!;
    const middle = (start + finish) / 2;
    while (pauseIndex < orderedPauses.length && orderedPauses[pauseIndex]!.tapTime <= middle) {
      const pause = orderedPauses[pauseIndex++]!;
      pauseEnd = Math.max(pauseEnd, pause.tapTime + pause.flightMs);
    }
    if (middle < pauseEnd) continue;
    if (rules.stumbleWindows?.some((window) => beachStumbleAllowed(rules, window) && middle >= window.startMs && middle < window.startMs + window.durationMs)) continue;
    const multiplier = (rules.baseModifiers?.shooterMultiplier ?? 1)
      * (phaseAt(rules.speedPhases, middle)?.shooterMultiplier ?? 1);
    motion += rules.beach ? integrateBeachMovement(rules, start, finish, multiplier, shooterFrequency)
      : integrate(finish, multiplier) - integrate(start, multiplier);
  }
  return motion;
}

/** A render sampler owns one immutable rules/history snapshot. Local pauses are append-only. */
export function createBonusChallengeMotionSampler(
  rules: BonusChallengeEnvironmentRules,
  shooterFrequency: number,
  authoritative: readonly BonusChallengeShotPause[],
): (elapsedMs: number, local: readonly BonusChallengeShotPause[]) => number {
  let localCount = -1;
  let ordered: BonusChallengeShotPause[] = [];
  let previousTime = 0;
  let motion = 0;
  return (elapsedMs, local) => {
    if (local.length !== localCount) {
      localCount = local.length;
      const acceptedTimes = [...authoritative].map((pause) => pause.tapTime).sort((a, b) => a - b);
      const pending = local.filter((pause) => {
        let low = 0;
        let high = acceptedTimes.length;
        while (low < high) {
          const middle = Math.floor((low + high) / 2);
          if (acceptedTimes[middle]! < pause.tapTime - 0.001) low = middle + 1;
          else high = middle;
        }
        return low === acceptedTimes.length || Math.abs(acceptedTimes[low]! - pause.tapTime) >= 0.001;
      });
      const all = [...authoritative, ...pending].sort((a, b) => a.tapTime - b.tapTime);
      ordered = [];
      for (const pause of all) {
        const last = ordered[ordered.length - 1];
        if (last && pause.tapTime <= last.tapTime + last.flightMs) {
          last.flightMs = Math.max(last.flightMs, pause.tapTime + pause.flightMs - last.tapTime);
        } else ordered.push({ ...pause });
      }
      previousTime = 0;
      motion = 0;
    }
    if (elapsedMs < previousTime) { previousTime = 0; motion = 0; }
    // Merged intervals have sorted ends as well as starts: skip historical flights.
    let low = 0;
    let high = ordered.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const pause = ordered[middle]!;
      if (pause.tapTime + pause.flightMs <= previousTime) low = middle + 1;
      else high = middle;
    }
    const relevant: BonusChallengeShotPause[] = [];
    for (let index = low; index < ordered.length && ordered[index]!.tapTime < elapsedMs; index += 1) {
      relevant.push(ordered[index]!);
    }
    motion += getBonusChallengeShooterMotionTime(rules, elapsedMs, shooterFrequency, relevant, previousTime);
    previousTime = elapsedMs;
    return motion;
  };
}

function phaseAt(
  phases: BonusChallengeSpeedPhase[] | undefined,
  elapsedMs: number,
): BonusChallengeSpeedPhase | null {
  if (!phases || phases.length === 0) return null;
  const cycleMs = phases.reduce((total, phase) => total + Math.max(1, phase.durationMs), 0);
  let cursor = ((Math.max(0, elapsedMs) % cycleMs) + cycleMs) % cycleMs;
  for (const phase of phases) {
    const duration = Math.max(1, phase.durationMs);
    if (cursor < duration) return phase;
    cursor -= duration;
  }
  return phases[phases.length - 1] ?? null;
}

function baseCondition(): BonusChallengeCondition {
  return {
    puckSpeedDelta: 0,
    puckSpeedMultiplier: 1,
    goalSpeedMultiplier: 1,
    goalieSpeedMultiplier: 1,
    shooterSpeedMultiplier: 1,
    canShoot: true,
    status: 'normal',
    fatigueLevel: 'none',
    stumbleActive: false,
    shooterXOffsetPx: 0,
    fatigueMs: 0,
    nutritionConsumed: 0,
    skatesConsumed: 0,
  };
}

export function getBonusChallengeCondition(
  rules: BonusChallengeEnvironmentRules | null | undefined,
  elapsedMs: number,
  reusable?: DuelPlayerCondition,
): BonusChallengeCondition {
  const result = (reusable ?? baseCondition()) as BonusChallengeCondition;
  Object.assign(result, baseCondition());
  if (!rules) return result;

  const elapsed = Math.max(0, elapsedMs);
  const base = rules.baseModifiers;
  const phase = phaseAt(rules.speedPhases, elapsed);
  const melt = beachMeltMultiplier(rules, elapsed);
  const phaseShooterMultiplier = (phase?.shooterMultiplier ?? 1) * melt;
  const baseShooterMultiplier = base?.shooterMultiplier ?? 1;
  result.goalSpeedMultiplier = base?.goalMultiplier ?? 1;
  result.goalieSpeedMultiplier = base?.goalieMultiplier ?? 1;
  result.puckSpeedMultiplier = (base?.puckSpeedMultiplier ?? 1) * (phase?.puckSpeedMultiplier ?? 1) * melt;

  const fatigue = rules.fatigue;
  if (rules.beach && fatigue) {
    const state = beachFatigueState(fatigue, elapsed);
    result.status = state.status;
    result.fatigueLevel = state.level;
    result.fatigueMs = state.normalizedFatigueMs;
    result.canShoot = state.canShoot;
    result.shooterSpeedMultiplier = state.speedMultiplier * baseShooterMultiplier * phaseShooterMultiplier;
    if (!state.canShoot) return result;
  } else if (fatigue) {
    const cycleMs = Math.max(
      1,
      fatigue.stopStartMs + fatigue.stopDurationMs + fatigue.recoveryDurationMs,
    );
    const cycleElapsed = elapsed % cycleMs;
    result.fatigueMs = Math.ceil(cycleElapsed);
    if (
      cycleElapsed >= fatigue.stopStartMs &&
      cycleElapsed < fatigue.stopStartMs + fatigue.stopDurationMs
    ) {
      result.status = 'exhausted_stop';
      result.fatigueLevel = 'resting';
      result.canShoot = false;
      result.shooterSpeedMultiplier = 0;
      return result;
    }
    const recovering = cycleElapsed >= fatigue.stopStartMs + fatigue.stopDurationMs;
    if (!recovering && cycleElapsed >= fatigue.heavyStartMs) {
      result.status = 'nutrition_slowdown';
      result.fatigueLevel = 'heavy';
      result.shooterSpeedMultiplier = baseShooterMultiplier * fatigue.heavyMultiplier * phaseShooterMultiplier;
    } else if (!recovering && cycleElapsed >= fatigue.slowdownStartMs) {
      result.status = 'tired';
      result.fatigueLevel = 'medium';
      result.shooterSpeedMultiplier = baseShooterMultiplier * fatigue.slowMultiplier * phaseShooterMultiplier;
    } else {
      result.shooterSpeedMultiplier = baseShooterMultiplier * phaseShooterMultiplier;
    }
  } else {
    result.shooterSpeedMultiplier = baseShooterMultiplier * phaseShooterMultiplier;
  }

  const stumbling = rules.stumbleWindows?.some(
    (window) => beachStumbleAllowed(rules, window) && elapsed >= window.startMs && elapsed < window.startMs + window.durationMs,
  );
  if (stumbling) {
    result.status = 'stumble';
    result.fatigueLevel = 'none';
    result.stumbleActive = true;
    result.canShoot = false;
  }
  return result;
}

/** Match the established render speed floor/precision for new beach snapshots. */
export function getBeachPuckSpeed(baseSpeed: number, multiplier: number): number {
  return Math.min(5, Math.max(.2, Number((baseSpeed * multiplier).toFixed(4))));
}
