import { describe, expect, it } from 'vitest';
import { pairAvailability } from '../../../src/duel/amateur/pairAvailability.js';

describe('pairAvailability', () => {
  const free = { reason: null, retryAt: null };
  it('blocks all formats when the opponent has two open duels', () => {
    expect(pairAvailability(free, free, 0, 2, 0, 2)).toEqual({
      available: false, reason: 'open_slots', player: 'opponent', retryAt: null,
    });
  });
  it('prefers the current player limit over the opponent limit', () => {
    expect(pairAvailability({ reason: 'daily', retryAt: new Date('2026-09-24T21:00:00Z') },
      { reason: 'format', retryAt: new Date('2026-10-01T00:00:00Z') }, 0, 0, 0, 2))
      .toMatchObject({ available: false, reason: 'daily', player: 'self' });
  });
  it('allows a pair with free capacity and slots', () => {
    expect(pairAvailability(free, free, 1, 1, 1, 2)).toEqual({
      available: true, reason: null, player: null, retryAt: null,
    });
  });
  it('blocks another invitation when only one remaining capacity is already pending', () => {
    expect(pairAvailability(free, free, 1, 0, 1, 2, 1)).toEqual({
      available: false, reason: 'outgoing', player: 'self', retryAt: null,
    });
  });
});
