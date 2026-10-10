import { describe, it, expect } from 'vitest';
import { durak } from '@hockey/game-core';
import { projectGame, advanceDeadline } from './durakState.js';
describe('online Durak state', () => {
  it('only exposes own hand and public counts', () => {
    const game = durak.createGame(() => 0.4);
    const view = projectGame(game, 1);
    expect(view.hand).toEqual(game.hands[1]);
    expect(view.opponentCount).toBe(6);
    expect(view.deckCount).toBe(24);
    expect(view).not.toHaveProperty('hands');
    expect(view).not.toHaveProperty('deck');
  });
  it('advances expired turns from absolute deadlines', () => {
    const game = durak.createGame(() => 0.4);
    const next = advanceDeadline(game, 1000, 41000);
    expect(next.game.revision).toBe(3);
    expect(next.deadline).toBe(61000);
    expect(advanceDeadline(game, 1000, 999).game).toBe(game);
  });
});
