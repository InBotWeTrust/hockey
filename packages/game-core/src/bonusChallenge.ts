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
  const phaseShooterMultiplier = phase?.shooterMultiplier ?? 1;
  const baseShooterMultiplier = base?.shooterMultiplier ?? 1;
  result.goalSpeedMultiplier = base?.goalMultiplier ?? 1;
  result.goalieSpeedMultiplier = base?.goalieMultiplier ?? 1;
  result.puckSpeedMultiplier = (base?.puckSpeedMultiplier ?? 1) * (phase?.puckSpeedMultiplier ?? 1);

  const fatigue = rules.fatigue;
  if (fatigue) {
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
    (window) => elapsed >= window.startMs && elapsed < window.startMs + window.durationMs,
  );
  if (stumbling) {
    result.status = 'stumble';
    result.fatigueLevel = 'none';
    result.stumbleActive = true;
    result.canShoot = false;
  }
  return result;
}
