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
      throw new Error('feint pattern not implemented in Plan 2');
  }
  return { position, width: GOALIE_SIZE.width, height: GOALIE_SIZE.height };
}
