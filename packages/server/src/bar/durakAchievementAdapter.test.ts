import { describe, it, expect } from 'vitest';
import { durak } from '@hockey/game-core';
import {
  createDurakAchievementTelemetry,
  observeDurakGameTransition,
  qualifiersForDurakPlayer,
} from './durakAchievementAdapter.js';
const card = (suit: durak.Suit, rank: number): durak.Card => ({
  id: `${suit}-${rank}`,
  suit,
  rank,
});
const base = (hands: [durak.Card[], durak.Card[]], trump: durak.Suit = 'clubs'): durak.Game => ({
  ...durak.createGame(() => 0.4),
  hands,
  deck: [],
  table: [],
  discard: [],
  attacker: 0,
  trump,
  phase: 'attack',
  result: null,
  limit: 6,
});
describe('trusted Durak feats', () => {
  it('does not award win-only feats during a game or after loss', () => {
    const t = createDurakAchievementTelemetry(durak.createGame(() => 0.4));
    expect(qualifiersForDurakPlayer(t, 0)).toEqual({});
    expect(qualifiersForDurakPlayer(t, 0, true)[41]).toBe(1);
  });
  it('observes six actual separate attacks and a fully defended six-card round', () => {
    const attack = [
      card('clubs', 6),
      card('spades', 6),
      card('hearts', 6),
      card('diamonds', 6),
      card('clubs', 7),
      card('spades', 7),
    ];
    const defense = [
      card('hearts', 7),
      card('spades', 8),
      card('hearts', 8),
      card('diamonds', 8),
      card('clubs', 9),
      card('spades', 9),
    ];
    let g = base([attack, defense], 'hearts');
    const t = createDurakAchievementTelemetry(g);
    const move = (actor: durak.Player, action: durak.Action) => {
      const n = durak.applyAction(g, actor, action);
      expect(n).not.toBe(g);
      observeDurakGameTransition(t, g, n, actor, action);
      g = n;
    };
    for (let i = 0; i < 6; i++) {
      move(0, { type: 'play', cardId: attack[i]!.id });
      move(1, { type: 'beat', cardId: defense[i]!.id, target: i });
    }
    expect(qualifiersForDurakPlayer(t, 0)).toMatchObject({ 42: 1 });
    expect(qualifiersForDurakPlayer(t, 1)).toEqual({});
    move(0, { type: 'finish' });
    expect(qualifiersForDurakPlayer(t, 1)).toMatchObject({ 40: 3 });
    expect(g.result).toBe('draw');
  });
  it('requires the winner’s own final two cards to be sixes', () => {
    let g = base([
      [card('hearts', 6), card('clubs', 6)],
      [card('diamonds', 9), card('spades', 9)],
    ]);
    const t = createDurakAchievementTelemetry(g);
    const move = (p: durak.Player, a: durak.Action) => {
      const n = durak.applyAction(g, p, a);
      expect(n).not.toBe(g);
      observeDurakGameTransition(t, g, n, p, a);
      g = n;
    };
    move(0, { type: 'play', cardId: 'hearts-6' });
    move(1, { type: 'take' });
    move(0, { type: 'play', cardId: 'clubs-6' });
    move(0, { type: 'finish' });
    expect(g.result).toBe(0);
    expect(qualifiersForDurakPlayer(t, 0, true)).toMatchObject({ 39: 1, 41: 1 });
    expect(qualifiersForDurakPlayer(t, 1)).not.toHaveProperty('39');
  });
  it('counts received trump identities, including trump cards taken from the table', () => {
    let g = base([
      [card('clubs', 6), card('hearts', 6)],
      [card('spades', 9), card('diamonds', 9)],
    ]);
    const t = createDurakAchievementTelemetry(g);
    for (const [p, a] of [
      [0, { type: 'play', cardId: 'clubs-6' }],
      [1, { type: 'take' }],
      [0, { type: 'finish' }],
    ] as [durak.Player, durak.Action][]) {
      const n = durak.applyAction(g, p, a);
      observeDurakGameTransition(t, g, n, p, a);
      g = n;
    }
    expect(t.trumpsReceived).toEqual([1, 1]);
    expect(t.tookTable[1]).toBe(true);
  });
});
