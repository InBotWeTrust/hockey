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
    expect(next.game.revision).toBe(2);
    expect(next.deadline).toBe(61000);
    expect(advanceDeadline(game, 1000, 999).game).toBe(game);
  });
});

it('automatically resolves an unbeatable final trump without losing or duplicating cards', () => {
  const ace = { id: 'clubs-14', rank: 14, suit: 'clubs' as const };
  const g = { ...durak.createGame(() => 0.4), attacker: 0 as const, trump: 'clubs' as const, deck: [], hands: [[], [{ id: 'hearts-6', rank: 6, suit: 'hearts' as const }]] as durak.Game['hands'], table: [{ attack: ace }], phase: 'defend' as const };
  const next = advanceDeadline(g, 3000, 6000);
  expect(next.game.result).toBe(0);
  expect(next.game.hands[1].map(c => c.id)).toEqual(['hearts-6', 'clubs-14']);
  expect(next.game.table).toEqual([]);
});
