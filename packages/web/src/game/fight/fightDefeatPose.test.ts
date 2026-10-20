import { expect, it } from 'vitest';
import { fightDefeatPose } from './fightDefeatPose.js';
it('shows the lethal contact first and only then switches to kneeling', () => {
  expect(fightDefeatPose(0, true, 1000, 1350)).toBe('hit');
  expect(fightDefeatPose(0, true, 1349, 1350)).toBe('hit');
  expect(fightDefeatPose(0, true, 1350, 1350)).toBe('lose');
  expect(fightDefeatPose(4, false, 1500, 0)).toBeNull();
});
