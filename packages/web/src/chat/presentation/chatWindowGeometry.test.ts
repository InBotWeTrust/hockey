import { expect, it } from 'vitest';
import { clampChatRect } from './chatWindowGeometry.js';
it('keeps move and resize operations inside the visible viewport', () => {
  const rect = clampChatRect(
    { x: 2000, y: -30, width: 700, height: 1200 },
    { width: 1024, height: 768 },
  );
  expect(rect.x + rect.width).toBeLessThanOrEqual(1012);
  expect(rect.y).toBeGreaterThanOrEqual(12);
  expect(rect.y + rect.height).toBeLessThanOrEqual(756);
  const small = clampChatRect(
    { x: 200, y: 200, width: 360, height: 600 },
    { width: 300, height: 280 },
  );
  expect(small.width).toBeLessThanOrEqual(276);
  expect(small.height).toBeLessThanOrEqual(256);
});
