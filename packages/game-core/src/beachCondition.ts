import { getPlayerFatigueState } from './playerFatigue.js';
import type { BonusChallengeEnvironmentRules, BonusChallengeFatigueRules, BonusChallengeStumbleWindow } from './bonusChallenge.js';

export function beachMeltMultiplier(rules: BonusChallengeEnvironmentRules, elapsedMs: number): number {
  const beach = rules.beach;
  return beach ? 1 + (beach.finalSpeedMultiplier - 1) * Math.min(1, Math.max(0, elapsedMs) / beach.meltDurationMs) : 1;
}
export function beachFatigueState(fatigue: BonusChallengeFatigueRules, elapsedMs: number) {
  return getPlayerFatigueState(elapsedMs, {
    fatigueGraceMs: 0,
    fatigueSlowdownStartMs: fatigue.slowdownStartMs,
    fatigueHeavySlowdownStartMs: fatigue.heavyStartMs,
    fatigueStopStartMs: fatigue.stopStartMs,
    fatigueStopDurationMs: fatigue.stopDurationMs,
    fatigueAfterRestMs: fatigue.recoveryDurationMs,
    fatigueSlowMultiplier: fatigue.slowMultiplier,
    fatigueHeavyMultiplier: fatigue.heavyMultiplier,
  });
}
export function beachStumbleAllowed(rules: BonusChallengeEnvironmentRules, window: BonusChallengeStumbleWindow): boolean {
  const f = rules.fatigue;
  if (!rules.beach || !f || f.stopDurationMs <= 0) return true;
  const cycle = Math.max(1, f.stopDurationMs + f.recoveryDurationMs + f.stopStartMs - f.slowdownStartMs);
  const first = Math.max(0, Math.floor((window.startMs - f.stopStartMs) / cycle));
  for (const index of [first, first + 1]) {
    const restStart = f.stopStartMs + index * cycle;
    if (window.startMs < restStart + f.stopDurationMs && window.startMs + window.durationMs > restStart) return false;
  }
  return true;
}

interface FatigueSpan { from: number; to: number; factor: number }
/** Zeroth and first moments of moving time, with complete cycles summed analytically. */
function fatigueMoments(f: BonusChallengeFatigueRules | undefined, time: number, factor: number): [number, number] {
  const spans: FatigueSpan[] = f ? [
    { from: 0, to: f.slowdownStartMs, factor: 1 },
    { from: f.slowdownStartMs, to: f.heavyStartMs, factor: f.slowMultiplier },
    { from: f.heavyStartMs, to: f.stopStartMs, factor: f.heavyMultiplier },
  ] : [{ from: 0, to: time, factor: 1 }];
  const moments = (parts: FatigueSpan[], limit: number): [number, number] => {
    let area = 0; let moment = 0;
    for (const span of parts) {
      const end = Math.min(limit, span.to);
      if (span.factor !== factor || end <= span.from) continue;
      area += end - span.from;
      moment += (end * end - span.from * span.from) / 2;
    }
    return [area, moment];
  };
  const initial = moments(spans, time);
  if (!f || time <= f.stopStartMs) return initial;
  const origin = f.stopStartMs;
  const recoveryEnd = f.stopDurationMs + f.recoveryDurationMs;
  const heavyStart = recoveryEnd + f.heavyStartMs - f.slowdownStartMs;
  const cycle = Math.max(1, recoveryEnd + f.stopStartMs - f.slowdownStartMs);
  const repeat: FatigueSpan[] = [
    { from: f.stopDurationMs, to: recoveryEnd, factor: 1 },
    { from: recoveryEnd, to: heavyStart, factor: f.slowMultiplier },
    { from: heavyStart, to: cycle, factor: f.heavyMultiplier },
  ];
  const count = Math.floor((time - origin) / cycle);
  const [area, moment] = moments(repeat, cycle);
  const [tailArea, tailMoment] = moments(repeat, (time - origin) % cycle);
  return [initial[0] + count * area + tailArea,
    initial[1] + count * moment + area * (count * origin + cycle * count * (count - 1) / 2)
      + tailMoment + (origin + count * cycle) * tailArea];
}

export function integrateBeachMovement(
  rules: BonusChallengeEnvironmentRules, start: number, end: number,
  phaseMultiplier: number, frequency: number,
): number {
  const beach = rules.beach!;
  const floor = .1 / frequency;
  const factors = new Set(rules.fatigue ? [1, rules.fatigue.slowMultiplier, rules.fatigue.heavyMultiplier] : [1]);
  let total = 0;
  for (const factor of factors) {
    const base = phaseMultiplier * factor;
    const boundaries = [start, end];
    if (beach.meltDurationMs > start && beach.meltDurationMs < end) boundaries.push(beach.meltDurationMs);
    const slope = base * (beach.finalSpeedMultiplier - 1) / beach.meltDurationMs;
    const crossing = slope === 0 ? -1 : (floor - base) / slope;
    if (crossing > start && crossing < end && crossing < beach.meltDurationMs) boundaries.push(crossing);
    boundaries.sort((a, b) => a - b);
    for (let i = 1; i < boundaries.length; i++) {
      const from = boundaries[i - 1]!; const to = boundaries[i]!;
      const middle = (from + to) / 2;
      const value = base * beachMeltMultiplier(rules, middle);
      const linear = middle < beach.meltDurationMs && value > floor;
      const a = linear ? base : Math.max(floor, value);
      const b = linear ? slope : 0;
      const left = fatigueMoments(rules.fatigue, from, factor);
      const right = fatigueMoments(rules.fatigue, to, factor);
      total += a * (right[0] - left[0]) + b * (right[1] - left[1]);
    }
  }
  return total;
}
