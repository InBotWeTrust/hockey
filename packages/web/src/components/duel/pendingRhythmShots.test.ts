import type { RhythmShot } from '@hockey/game-core';
import { expect, it } from 'vitest';
import { mergePendingRhythmShots } from './pendingRhythmShots.js';
const first = { index: 1, travel: 1, goal: true };
const second = { index: 2, travel: 2, goal: true };
it('keeps both unacknowledged goals in their original order', () => {
  expect(mergePendingRhythmShots<RhythmShot>([], [first, second], 2)).toEqual([first, second]);
});
it('prefers authoritative outcomes without duplicating a locally predicted goal', () => {
  const confirmed = { travel: 1, goal: false };
  expect(mergePendingRhythmShots([confirmed], [first, second], 2)).toEqual([confirmed, second]);
});
it('does not expose an in-flight or cancelled shot, or invent a missing predecessor', () => {
  expect(mergePendingRhythmShots<RhythmShot>([], [first, second], 1)).toEqual([first]);
  expect(mergePendingRhythmShots<RhythmShot>([], [first, second], 0)).toEqual([]);
  expect(mergePendingRhythmShots<RhythmShot>([], [second], 2)).toEqual([]);
});
