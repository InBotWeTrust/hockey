import { expect, it } from 'vitest';
import { barActionsFor } from '../../src/barLayout.js';
it('assigns one game per character and leaves the other characters without games', () => {
  expect(barActionsFor('maria')).toEqual(['cards']);
  expect(barActionsFor('daria')).toEqual(['darts']);
  expect(barActionsFor('veronika')).toEqual(['billiards']);
  expect(barActionsFor('arsenich')).toEqual(['checkers']);
  expect(barActionsFor('grigory')).toEqual(['ochko']);
  expect(barActionsFor('oleg')).toEqual(['armwrestling']);
  for (const id of ['timofey', 'igor'] as const)
    expect(barActionsFor(id)).toEqual([]);
});
