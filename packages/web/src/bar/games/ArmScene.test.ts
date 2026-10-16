import { expect, it } from 'vitest';
import { armFrame } from './ArmScene.js';
it('uses left-side artwork for viewer progress and pins only at the end', () => {
  expect(armFrame(0, 0)).toBe(2);
  expect(armFrame(0.6, 0)).toBe(1);
  expect(armFrame(1, 0)).toBe(0);
  expect(armFrame(-1, 0)).toBe(4);
  expect(armFrame(-1, 1)).toBe(0);
});
