import { RINK, DRIFT_HEIGHT } from '@hockey/game-core';
import { perspectiveIceCarPose, SCRAPE_SPRITE_WIDTH } from './renderer/IceCar.js';
import { TRAINING_NEW_COURT_VISUAL_Y_OFFSET, TRAINING_NEW_COURT_VISUAL_Y_SCALE } from './trainingNewCourt.js';

// Convert the drift canvas (35–100% of the court) to the regular rink layer.
export function driftCaretakerWidth(courtWidth: number, driftY: number): number {
  const courtY = 0.35 + (driftY / DRIFT_HEIGHT) * 0.65;
  const visualY = ((courtY - 0.2455) / 0.742) * RINK.height;
  const rinkY = (visualY - TRAINING_NEW_COURT_VISUAL_Y_OFFSET) / TRAINING_NEW_COURT_VISUAL_Y_SCALE;
  const pose = perspectiveIceCarPose({ x: RINK.width / 2, y: rinkY, rot: 0 });
  return (courtWidth / RINK.width) * SCRAPE_SPRITE_WIDTH * pose.size;
}
