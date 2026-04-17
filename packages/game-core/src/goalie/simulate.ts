import type { GoalieConfig, GoalieState } from './types.js';
import { GOALIE_SIZE } from './types.js';
import { createRng } from '../rng.js';
import { linearPattern, sinePattern, dashPattern } from './patterns.js';

export function simulateGoalie(
  cfg: GoalieConfig,
  seed: string,
  shotIndex: number,
  t: number,
): GoalieState {
  // Fresh PRNG stream per call — see patterns.ts for why dashPattern needs this.
  const rng = createRng(`${seed}:${shotIndex}:${cfg.id}`);
  let position;
  switch (cfg.pattern) {
    case 'linear':
      position = linearPattern(cfg, rng, t);
      break;
    case 'sine':
      position = sinePattern(cfg, rng, t);
      break;
    case 'dash':
      position = dashPattern(cfg, rng, t);
      break;
    case 'feint':
      // TODO(plan-3): implement feintPattern. For Plan 2 the three feint
      // bosses (trickster/iceking/legend) fall back to sine so the ladder
      // stays fully playable. Determinism is preserved — same seed gives
      // the same sine position; Plan 3 will bump GAME_CORE_VERSION.
      position = sinePattern(cfg, rng, t);
      break;
  }
  return { position, width: GOALIE_SIZE.width, height: GOALIE_SIZE.height };
}
