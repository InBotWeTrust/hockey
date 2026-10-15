import { expect, it } from 'vitest';
import { barActionsFor } from '../../src/barLayout.js';
it('assigns one game per character and leaves the other characters without games', () => {
  expect(barActionsFor('maria')).toEqual(['darts']);
  expect(barActionsFor('daria')).toEqual(['cards']);
  expect(barActionsFor('veronika')).toEqual(['billiards']);
  expect(barActionsFor('arsenich')).toEqual(['checkers']);
  for (const id of ['grigory', 'timofey', 'oleg', 'igor'] as const)
    expect(barActionsFor(id)).toEqual([]);
});
