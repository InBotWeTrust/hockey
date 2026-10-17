import { expect, it } from 'vitest';
import { createPrivateOchko } from './ochkoDeck.js';

it('keeps the new round pause in private character and online decks', () => {
  for (const character of [true, false]) {
    expect(createPrivateOchko(1000, 17, character)).toHaveProperty('roundPauseMs', 3000);
    expect(createPrivateOchko(1000, 16, character)).not.toHaveProperty('roundPauseMs');
  }
});
