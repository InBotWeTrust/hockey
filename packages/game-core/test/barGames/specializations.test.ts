import { expect, it } from 'vitest';
import { barActionsFor } from '../../src/barLayout.js';
import { CHARACTER_GAME } from '../../src/barGames/runtime.js';
it('opens cards for Maria and darts for Daria', () => {
  expect(barActionsFor('maria')).toEqual(['cards']);
  expect(barActionsFor('daria')).toEqual(['darts']);
  expect(CHARACTER_GAME).toMatchObject({
    daria: 'darts',
    veronika: 'billiards',
    arsenich: 'checkers',
  });
});
