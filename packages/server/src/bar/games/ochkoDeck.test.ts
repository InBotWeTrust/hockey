import { expect, it } from 'vitest';
import { createPrivateOchko } from './ochkoDeck.js';

it('keeps the new round pause in private character and online decks', () => {
  for (const character of [true, false]) {
    expect(createPrivateOchko(1000, 17, character)).toHaveProperty('roundPauseMs', 3000);
    expect(createPrivateOchko(1000, 16, character)).not.toHaveProperty('roundPauseMs');
  }
});

it('uses five deals only for new Grigory matches', () => {
  expect(createPrivateOchko(0, 20, true)).toHaveProperty('series.totalRounds', 5);
  expect(createPrivateOchko(0, 20, false)).toHaveProperty('series.totalRounds', 4);
  expect(createPrivateOchko(0, 19, true)).toHaveProperty('series.totalRounds', 4);
});
