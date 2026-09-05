import type { GoalieConfig, GoalieState } from './types.js';
import { GOALIE_SIZE } from './types.js';
import { createRng } from '../rng.js';
import { linearPattern, sinePattern, dashPattern, dashPatternFromPick } from './patterns.js';

export type GoalieSimulator = (t: number, phaseOffsetMs?: number) => GoalieState;

const UNUSED_RNG = {
  next: () => 0,
  range: (min: number) => min,
};

export function createGoalieSimulator(
  cfg: GoalieConfig,
  seed: string,
  shotIndex: number,
): GoalieSimulator {
  if (cfg.pattern !== 'dash') {
    return (t, phaseOffsetMs = 0) => {
      const et = t + phaseOffsetMs;
      const position =
        cfg.pattern === 'linear'
          ? linearPattern(cfg, UNUSED_RNG, et)
          : sinePattern(cfg, UNUSED_RNG, et);
      return { position, width: GOALIE_SIZE.width, height: GOALIE_SIZE.height };
    };
  }

  const rng = createRng(`${seed}:${shotIndex}:${cfg.id}`);
  const picks: number[] = [];
  return (t, phaseOffsetMs = 0) => {
    const et = t + phaseOffsetMs;
    const period = 1000 / Math.max(cfg.frequency, 0.1);
    const step = Math.floor(et / period);
    while (picks.length <= step) picks.push(rng.next());
    const position = dashPatternFromPick(cfg, step < 0 ? 0 : picks[step]!);
    return { position, width: GOALIE_SIZE.width, height: GOALIE_SIZE.height };
  };
}

export function simulateGoalie(
  cfg: GoalieConfig,
  seed: string,
  shotIndex: number,
  t: number,
  phaseOffsetMs = 0,
): GoalieState {
  // Fresh PRNG stream per call — see patterns.ts for why dashPattern needs this.
  const rng = createRng(`${seed}:${shotIndex}:${cfg.id}`);
  const et = t + phaseOffsetMs;
  let position;
  switch (cfg.pattern) {
    case 'linear':
      position = linearPattern(cfg, rng, et);
      break;
    case 'sine':
      position = sinePattern(cfg, rng, et);
      break;
    case 'dash':
      position = dashPattern(cfg, rng, et);
      break;
    case 'feint':
      // TODO(plan-3): implement feintPattern. For Plan 2 the three feint
      // bosses (trickster/iceking/legend) fall back to sine so the ladder
      // stays fully playable. Determinism is preserved — same seed gives
      // the same sine position; Plan 3 will bump GAME_CORE_VERSION.
      position = sinePattern(cfg, rng, et);
      break;
  }
  return { position, width: GOALIE_SIZE.width, height: GOALIE_SIZE.height };
}
