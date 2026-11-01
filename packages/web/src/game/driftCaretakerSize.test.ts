import { expect, it } from 'vitest';
import { RINK, DRIFT_HEIGHT } from '@hockey/game-core';
import { driftCaretakerWidth } from './driftCaretakerSize.js';
import { perspectiveIceCarPose, SCRAPE_SPRITE_WIDTH } from './renderer/IceCar.js';

it('matches the idle caretaker at the same screen depth on different phone widths', () => {
  for (const width of [320, 390, 430]) {
    for (const y of [180, 350, 550]) {
      const pose = perspectiveIceCarPose({ x: 286, y, rot: 0 });
      const courtY = 0.2455 + (pose.y / RINK.height) * 0.742;
      const driftY = ((courtY - 0.35) / 0.65) * DRIFT_HEIGHT;
      expect(driftCaretakerWidth(width, driftY)).toBeCloseTo(width / RINK.width * SCRAPE_SPRITE_WIDTH * pose.size, 8);
    }
  }
});
it('scales uniformly with viewport width and grows toward the foreground', () => {
  expect(driftCaretakerWidth(390, 690)).toBeGreaterThan(driftCaretakerWidth(390, 100));
  expect(driftCaretakerWidth(640, 400)).toBeCloseTo(2 * driftCaretakerWidth(320, 400));
});
