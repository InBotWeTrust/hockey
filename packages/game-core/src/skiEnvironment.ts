import { resolvePerspectiveCourtShot } from './court/perspective.js';
import {
  STICK_NEUTRAL,
  PUCK_SPEED_PER_MS,
  type ShotInput,
  type StickEffects,
} from './shot/types.js';
import { GOALIE_Y, type GoalieConfig } from './goalie/types.js';
import { PUCK_START, GOAL_OPENING } from './rink.js';
import { getSessionPhaseOffsets } from './session.js';
import { createRng } from './rng.js';
import { getPlayerFatigueState } from './playerFatigue.js';
import { skiSlopeMotionTime } from './skiSlope.js';
import type { BonusChallengeShotPause } from './bonusChallenge.js';
export type SkiTarget = 'goal' | 'goalie' | 'player';
export interface SkiSlip {
  startMs: number;
  endMs: number;
  startPhase: number;
  target: SkiTarget;
}
const timing = {
  fatigueGraceMs: 0,
  fatigueSlowdownStartMs: 8000,
  fatigueHeavySlowdownStartMs: 18000,
  fatigueStopStartMs: 30000,
  fatigueStopDurationMs: 4000,
  fatigueAfterRestMs: 8000,
  fatigueSlowMultiplier: 0.85,
  fatigueHeavyMultiplier: 0.65,
};
const mod = (n: number, p: number) => ((n % p) + p) % p;
export function sampleSkiPlayer(
  time: number,
  frequency: number,
  offset = 0,
  pauses: readonly BonusChallengeShotPause[] = [],
  events: readonly SkiSlip[] = [],
  fatigueEnabled = true,
) {
  const end = Math.max(0, time),
    period = 1000 / frequency,
    half = period / 2;
  let phase = mod(offset, period),
    cursor = 0,
    climbs = 0,
    restUntil = 0,
    lastRestEnd = -Infinity,
    eventIndex = 0;
  let slip: SkiSlip | null = null;
  const own = events.filter((e) => e.target === 'player');
  while (cursor < end - 1e-8) {
    const cycle = Math.floor(phase / period + 1e-12);
    let local = phase - cycle * period;
    if (Math.abs(local) < 1e-8) local = 0;
    if (Math.abs(local - half) < 1e-8) local = half;
    phase = cycle * period + local;
    if (restUntil > cursor + 1e-8) {
      cursor = Math.min(end, restUntil);
      continue;
    }
    if (restUntil && cursor >= restUntil) {
      climbs = 0;
      lastRestEnd = restUntil;
      restUntil = 0;
    }
    const paused = pauses.find(
      (p) => cursor >= p.tapTime - 1e-8 && cursor < p.tapTime + p.flightMs - 1e-8,
    );
    if (paused) {
      cursor = Math.min(end, paused.tapTime + paused.flightMs);
      continue;
    }
    if (fatigueEnabled && local === 0 && climbs >= 14) {
      restUntil = cursor + 4000;
      continue;
    }
    const event = own[eventIndex];
    if (event && cursor >= event.startMs - 1e-8 && local < half && !slip) {
      phase = cycle * period + period - local;
      slip = { ...event, startMs: cursor, endMs: cursor + local / 1.25, startPhase: local };
      eventIndex++;
      continue;
    }
    if (slip && cursor >= slip.endMs - 1e-8) slip = null;
    const uphill = local < half;
    const rate = uphill ? 0.65 - 0.05 * Math.min(6, Math.floor((fatigueEnabled ? climbs : 0) / 2)) : 1.25;
    let span = Math.min(end - cursor, ((uphill ? half : period) - local) / rate);
    if (event && event.startMs > cursor + 1e-8) span = Math.min(span, event.startMs - cursor);
    for (const p of pauses)
      if (p.tapTime > cursor + 1e-8) span = Math.min(span, p.tapTime - cursor);
    const reachesTop = uphill && Math.abs(local + span * rate - half) < 1e-7;
    phase += span * rate;
    cursor += span;
    if (reachesTop) climbs++;
    if (span < 1e-8) break;
  }
  if (restUntil && cursor >= restUntil - 1e-8) {
    climbs = 0;
    lastRestEnd = restUntil;
    restUntil = 0;
  }
  if (slip && end >= slip.endMs - 1e-8) slip = null;
  const resting = restUntil > end + 1e-8;
  const stage = Math.min(6, Math.floor((fatigueEnabled ? climbs : 0) / 2));
  const uphillMultiplier = 0.65 - 0.05 * stage,
    slowdownPercent = Math.round((1 - uphillMultiplier) * 100);
  const fatigue = getPlayerFatigueState(
    resting ? 30000 : stage >= 4 ? 18000 : stage > 0 ? 8000 : 0,
    timing,
  );
  const recovering = end - lastRestEnd < 2000 && climbs < 2;
  const notice = !fatigueEnabled ? '' : resting
    ? 'Передышка · бросок недоступен'
    : `${recovering ? 'Силы восстановлены' : stage >= 4 ? 'Сильная усталость' : 'Тяжело подниматься'} · замедление ${slowdownPercent}%`;
  return {
    clock: phase - mod(offset, period),
    direction: mod(phase, period) < half ? 'uphill' : 'downhill',
    canShoot: !resting && !slip && !skiVisualAt(own, end),
    fatigue,
    notice,
    slowdownPercent,
    uphillMultiplier,
    climbs,
    slip,
    recovering,
    restRemaining: Math.max(0, restUntil - end),
  };
}
export function skiGoalClock(
  time: number,
  frequency: number,
  offset: number,
  events: readonly SkiSlip[],
) {
  let origin = 0,
    phase = offset;
  const period = 1000 / frequency;
  for (const event of events) {
    if (time < event.startMs) break;
    if (time < event.endMs)
      return period - event.startPhase + (time - event.startMs) * 1.25 - offset;
    origin = event.endMs;
    phase = 0;
  }
  return phase + skiSlopeMotionTime(time - origin, frequency, phase) - offset;
}
export function createSkiSlips(
  seed: string,
  duration: number,
  frequency: number,
  offset: number,
  config?: {
    speeds: Record<SkiTarget, number>;
    offsets: Record<SkiTarget, number>;
    pauses?: readonly BonusChallengeShotPause[];
    fatigueEnabled?: boolean;
  },
): SkiSlip[] {
  const rng = createRng(seed);
  const shuffle = <T>(items: T[]) => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
    return items;
  };
  const intervalMs = 8000,
    count = Math.floor(duration / intervalMs);
  const entities: SkiTarget[] = ['goal', 'goalie', 'player'];
  const extra = shuffle([...entities]);
  const targets: SkiTarget[] = config
    ? shuffle(
        Array.from({ length: count }, (_, i) =>
          i < Math.floor(count / 3) * 3 ? entities[i % 3]! : extra[i - Math.floor(count / 3) * 3]!,
        ),
      )
    : Array(count).fill('goal');
  const slots = Array.from({ length: count }, (_, i) => i);
  const events: SkiSlip[] = [];
  for (const [index, slot] of slots.entries()) {
    const target = targets[index]!,
      f = config?.speeds[target] ?? frequency,
      o = config?.offsets[target] ?? offset;
    const period = 1000 / f,
      half = period / 2,
      desired = half * (0.2 + 0.6 * rng.next());
    let candidate = Math.max(
      slot * intervalMs + rng.next() * 2000,
      (events.at(-1)?.endMs ?? -4000) + 4000,
    );
    let startMs: number;
    if (target === 'player') {
      startMs = candidate;
      for (let guard = 0; guard < 10000; guard++) {
        const paused = config?.pauses?.find(
          (p) => candidate >= p.tapTime && candidate < p.tapTime + p.flightMs,
        );
        if (paused) {
          candidate = paused.tapTime + paused.flightMs;
          continue;
        }
        const sample = sampleSkiPlayer(candidate, f, o, config?.pauses ?? [], events, config?.fatigueEnabled !== false);
        const local = mod(sample.clock + o, period);
        if (!sample.canShoot || sample.direction !== 'uphill' || local > desired) {
          candidate += 10;
          continue;
        }
        startMs = candidate + (desired - local) / sample.uphillMultiplier;
        const crossing = config?.pauses?.find(
          (p) => p.tapTime >= candidate && p.tapTime <= startMs,
        );
        if (crossing) {
          candidate = crossing.tapTime + crossing.flightMs;
          continue;
        }
        break;
      }
    } else {
      const phase = mod(
        skiGoalClock(
          candidate,
          f,
          o,
          events.filter((e) => e.target === target),
        ) + o,
        period,
      );
      const wait =
        phase < desired
          ? (desired - phase) / 0.65
          : phase < half
            ? (half - phase) / 0.65 + half / 1.25 + desired / 0.65
            : (period - phase) / 1.25 + desired / 0.65;
      startMs = candidate + wait;
    }
    events.push({ startMs, endMs: startMs + desired / 1.25, startPhase: desired, target });
  }
  return events;
}
export const activeSkiSlip = (events: readonly SkiSlip[], time: number) =>
  events.find((e) => time >= e.startMs && time < e.endMs) ?? null;
export const skiSnowStrength = (events: readonly SkiSlip[], time: number) =>
  events.some((e) => time >= e.startMs - 1200 && time < e.endMs) ? 'heavy' : 'light';
export function skiNotice(
  time: number,
  sample: ReturnType<typeof sampleSkiPlayer>,
  events: readonly SkiSlip[],
): string | null {
  const event = sample.slip ?? skiVisualAt(events, time);
  return sample.fatigue.level === 'resting'
    ? sample.notice
    : event
      ? `${event.target === 'player' ? 'Игрок' : event.target === 'goalie' ? 'Вратарь' : 'Ворота'} скольз${event.target === 'goal' ? 'ят' : 'ит'} по снегу`
      : time < 5000
        ? 'Влево — спуск · вправо — подъём'
        : sample.notice;
}
export const skiVisualAt = (events: readonly SkiSlip[], time: number) =>
  events.find((e) => time >= e.startMs && time < e.endMs) ?? null;

export interface SkiEnvironmentRules {
  version: 1;
  seed: string;
  durationMs: number;
  slipsEnabled?: boolean | undefined;
  fatigueEnabled?: boolean | undefined;
}
export function createSkiAttemptSampler(
  rules: SkiEnvironmentRules,
  speeds: Record<SkiTarget, number>,
) {
  const offsets = getSessionPhaseOffsets(rules.seed);
  let key: string | null = null,
    cached: SkiSlip[] = [];
  const events = (pauses: readonly BonusChallengeShotPause[]) => {
    if (rules.slipsEnabled === false) return [];
    const next = JSON.stringify(pauses);
    if (next !== key) {
      key = next;
      cached = createSkiSlips(rules.seed, rules.durationMs, speeds.goal, offsets.goal, {
        speeds,
        offsets: { goal: offsets.goal, goalie: offsets.goalie, player: offsets.shooter },
        pauses,
        fatigueEnabled: rules.fatigueEnabled !== false,
      });
    }
    return cached;
  };
  return {
    events,
    player: (time: number, pauses: readonly BonusChallengeShotPause[]) =>
      sampleSkiPlayer(time, speeds.player, offsets.shooter, pauses, events(pauses), rules.fatigueEnabled !== false),
    court: (target: 'goal' | 'goalie', time: number, pauses: readonly BonusChallengeShotPause[]) =>
      skiGoalClock(
        time,
        speeds[target],
        offsets[target],
        events(pauses).filter((e) => e.target === target),
      ),
  };
}

export function resolveSkiCourtShot(
  input: ShotInput,
  goalie: GoalieConfig,
  seed: string,
  shotIndex: number,
  rules: SkiEnvironmentRules,
  pauses: readonly BonusChallengeShotPause[],
  stick: StickEffects = STICK_NEUTRAL,
) {
  const speeds = {
    goal: input.goalFrequency ?? goalie.goalFrequency ?? 0.5,
    goalie: input.goalieFrequency ?? goalie.frequency,
    player: input.shooterFrequency ?? 0.75,
  };
  const sampler = createSkiAttemptSampler(rules, speeds);
  const puckSpeed = input.puckSpeedPerMs ?? PUCK_SPEED_PER_MS;
  const flightMs = (PUCK_START.y - GOAL_OPENING.y) / puckSpeed;
  const history = [
    ...pauses.filter((p) => Math.abs(p.tapTime - input.tapTime) > 0.001),
    { tapTime: input.tapTime, flightMs },
  ];
  return resolvePerspectiveCourtShot(
    { ...input, shooterMotionTime: sampler.player(input.tapTime, pauses).clock },
    goalie,
    seed,
    shotIndex,
    stick,
    getSessionPhaseOffsets(rules.seed),
    {
      goalTimeMs: sampler.court('goal', input.tapTime + flightMs, history),
      goalieTimeMs: sampler.court(
        'goalie',
        input.tapTime + (PUCK_START.y - GOALIE_Y) / puckSpeed,
        history,
      ),
    },
  );
}
