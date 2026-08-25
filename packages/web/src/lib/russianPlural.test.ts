import { describe, expect, it } from 'vitest';
import { formatRussianCount } from './russianPlural.js';

describe('formatRussianCount', () => {
  it.each([
    [0, '0 звёзд'],
    [1, '1 звезда'],
    [2, '2 звезды'],
    [4, '4 звезды'],
    [5, '5 звёзд'],
    [11, '11 звёзд'],
    [14, '14 звёзд'],
    [21, '21 звезда'],
    [22, '22 звезды'],
    [25, '25 звёзд'],
  ])('formats %i with the Russian one/few/many rule', (value, expected) => {
    expect(formatRussianCount(value, 'звезда', 'звезды', 'звёзд')).toBe(expected);
  });
});
