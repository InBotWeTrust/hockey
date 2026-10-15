import { expect, it } from 'vitest';
import { createMatch, type BarGameSnapshot } from '@hockey/game-core';
import { mergeGameSnapshot } from './useGameMatch.js';
it('does not roll a current match back to an earlier poll response', () => {
  const a: BarGameSnapshot = {
    id: 'a',
    kind: 'darts',
    player: 0,
    character: 'maria',
    participants: [],
    runtime: createMatch('darts', 0, 0, true, 1),
    ready: null,
    serverNow: 0,
  };
  const b = { ...a, runtime: { ...a.runtime, revision: 2 } };
  expect(mergeGameSnapshot(b, a)).toBe(b);
  expect(mergeGameSnapshot(b, { ...a, id: 'new' }).id).toBe('new');
});
