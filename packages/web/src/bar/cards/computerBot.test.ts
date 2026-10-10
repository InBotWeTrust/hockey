import { expect, it } from 'vitest';
import { botView, chooseBotAction } from './bot.js';
import { activePlayer, applyAction, createGame, legalActions, type Card } from './rules.js';
const c = (suit: Card['suit'], rank: number): Card => ({ id: `${suit}-${rank}`, suit, rank });
it('Arsenich reserves the only trump coverage and beats the other card by suit', () => {
  const g = createGame(() => 0.4);
  Object.assign(g, {
    trump: 'hearts',
    attacker: 0,
    phase: 'defend',
    table: [{ attack: c('clubs', 6) }, { attack: c('spades', 14) }],
  });
  g.hands[1] = [c('hearts', 6), c('clubs', 14)];
  expect(chooseBotAction(botView(g, 1), 'arsenich')).toEqual({
    type: 'beat',
    cardId: 'clubs-14',
    target: 0,
  });
});
it('Daria sometimes spends an expensive card while Maria preserves it', () => {
  const g = createGame(() => 0.4);
  Object.assign(g, {
    trump: 'hearts',
    attacker: 0,
    phase: 'defend',
    table: [{ attack: c('clubs', 6) }],
  });
  g.hands[1] = [c('hearts', 14), c('clubs', 7)];
  expect(chooseBotAction(botView(g, 1), 'daria', () => 0.1)).toEqual({
    type: 'beat',
    cardId: 'hearts-14',
    target: 0,
  });
  expect(chooseBotAction(botView(g, 1))).toEqual({ type: 'beat', cardId: 'clubs-7', target: 0 });
});
it('all ordinary profiles make legal moves and finish seeded games without losing cards', () => {
  for (const profile of ['daria', 'maria', 'grigory', 'arsenich'] as const) {
    for (let seed = 1; seed <= 8; seed++) {
      let n = seed;
      const random = () => (n = (n * 1664525 + 1013904223) >>> 0) / 4294967296;
      let g = createGame(random);
      for (let step = 0; step < 2000 && g.result === null; step++) {
        const p = activePlayer(g);
        const a = chooseBotAction(botView(g, p), profile, random)!;
        expect(legalActions(g, p)).toContainEqual(a);
        g = applyAction(g, p, a);
        const cards = [
          ...g.deck,
          ...g.discard,
          ...g.hands.flat(),
          ...g.table.flatMap((p) => [p.attack, ...(p.defence ? [p.defence] : [])]),
        ];
        expect(new Set(cards.map((c) => c.id)).size).toBe(36);
      }
      expect(g.result).not.toBeNull();
    }
  }
});

it('Arsenich uses public discards in the endgame instead of always leading the smallest card', () => {
  const g = createGame(() => 0.4);
  g.attacker = 1;
  g.phase = 'attack';
  g.deck = [];
  g.trump = 'hearts';
  g.hands[1] = [c('clubs', 6), c('spades', 7)];
  g.discard = Array.from({ length: 7 }, (_, i) => c('spades', 8 + i));
  expect(chooseBotAction(botView(g, 1), 'maria')).toEqual({ type: 'play', cardId: 'clubs-6' });
  expect(chooseBotAction(botView(g, 1), 'arsenich')).toEqual({ type: 'play', cardId: 'spades-7' });
});
