import { it, expect } from 'vitest';
import { tableState, type OnlineSnapshot } from './onlineApi.js';
import { legalActions } from './rules.js';
it('builds a local table with placeholders instead of private cards', () => {
  const view: OnlineSnapshot = {
    id: 'test',
    hand: [{ id: 'hearts-6', suit: 'hearts', rank: 6 }],
    opponentCount: 8,
    deckCount: 12,
    trump: 'clubs',
    trumpCard: { id: 'clubs-9', rank: 9, suit: 'clubs' },
    attacker: 0,
    table: [],
    limit: 6,
    phase: 'attack',
    revision: 4,
    result: null,
    deadline: 1000,
    serverNow: 0,
    opponent: { displayName: 'Соперник', avatarUrl: null },
  };
  const game = tableState(view);
  expect(game.hands[1]).toHaveLength(8);
  expect(game.deck).toHaveLength(12);
  expect(game.hands[1].every((card) => card.rank === 0)).toBe(true);
  expect(legalActions(game, 0)).toEqual([{ type: 'play', cardId: 'hearts-6' }]);
});
