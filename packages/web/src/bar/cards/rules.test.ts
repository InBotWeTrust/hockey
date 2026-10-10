import { describe, expect, it } from 'vitest';
import {
  applyAction,
  canBeat,
  createGame,
  legalActions,
  timeoutAction,
  type Game,
  type Card,
} from './rules.js';
const c = (rank: number, suit = 'clubs'): Card => ({
  id: `${suit}-${rank}`,
  rank,
  suit: suit as Card['suit'],
});
const state = (patch: Partial<Game> = {}): Game => ({
  hands: [
    [c(6), c(8)],
    [c(7), c(9)],
  ],
  deck: [],
  trump: 'hearts',
  trumpCard: c(14, 'hearts'),
  attacker: 0,
  table: [],
  discard: [],
  limit: 2,
  phase: 'attack',
  result: null,
  revision: 0,
  ...patch,
});
describe('Durak rules', () => {
  it('deals 36 unique cards and keeps last trump in deck', () => {
    const g = createGame(() => 0.42);
    const all = [...g.hands.flat(), ...g.deck];
    expect(all).toHaveLength(36);
    expect(new Set(all.map((x) => x.id)).size).toBe(36);
    expect(g.hands.map((h) => h.length)).toEqual([6, 6]);
    expect(g.deck.at(-1)).toEqual(g.trumpCard);
  });
  it('only higher same suit or trump beats a card', () => {
    expect(canBeat(c(7), c(6), 'hearts')).toBe(true);
    expect(canBeat(c(6, 'hearts'), c(14), 'hearts')).toBe(true);
    expect(canBeat(c(14), c(6, 'hearts'), 'hearts')).toBe(false);
    expect(canBeat(c(7, 'spades'), c(6), 'hearts')).toBe(false);
  });
  it('rejects wrong player and nonmatching throw-ins without mutation', () => {
    const g = state();
    expect(applyAction(g, 1, { type: 'play', cardId: c(7).id })).toBe(g);
    const next = applyAction(g, 0, { type: 'play', cardId: c(6).id });
    expect(next.phase).toBe('defend');
    expect(applyAction(next, 0, { type: 'play', cardId: c(8).id })).toBe(next);
  });
  it('defends, settles discard and rotates attack only on finish', () => {
    let g = applyAction(state(), 0, { type: 'play', cardId: c(6).id });
    g = applyAction(g, 1, { type: 'beat', cardId: c(7).id, target: 0 });
    expect(g.result).toBeNull();
    g = applyAction(g, 0, { type: 'finish' });
    expect(g.attacker).toBe(1);
    expect(g.discard).toHaveLength(2);
  });
  it('pickup allows legal throw-ins and keeps attacker after finish', () => {
    let g = applyAction(
      state({
        hands: [
          [c(6), c(6, 'spades')],
          [c(7), c(9)],
        ],
      }),
      0,
      { type: 'play', cardId: c(6).id },
    );
    g = applyAction(g, 1, { type: 'take' });
    expect(g.phase).toBe('taking');
    expect(legalActions(g, 0)).toContainEqual({ type: 'play', cardId: c(6, 'spades').id });
    g = applyAction(g, 0, { type: 'play', cardId: c(6, 'spades').id });
    g = applyAction(g, 0, { type: 'finish' });
    expect(g.hands[1]).toHaveLength(4);
    expect(g.attacker).toBe(0);
    expect(g.result).toBe(0);
  });
  it('draws attacker first and awards last trump to defender', () => {
    let g = state({ deck: [c(10), c(14, 'hearts')], hands: [[c(6)], [c(7)]] });
    g = applyAction(g, 0, { type: 'play', cardId: c(6).id });
    g = applyAction(g, 1, { type: 'beat', cardId: c(7).id, target: 0 });
    g = applyAction(g, 0, { type: 'finish' });
    expect(g.hands[0].map((x) => x.rank)).toEqual([10, 14]);
    expect(g.hands[1]).toHaveLength(0);
    expect(g.result).toBe(1);
  });
  it('returns draw only after final successful defence is settled', () => {
    let g = state({ hands: [[c(6)], [c(7)]] });
    g = applyAction(g, 0, { type: 'play', cardId: c(6).id });
    g = applyAction(g, 1, { type: 'beat', cardId: c(7).id, target: 0 });
    expect(g.result).toBeNull();
    g = applyAction(g, 0, { type: 'finish' });
    expect(g.result).toBe('draw');
  });
  it('timeout attacks with smallest nontrump and takes on defence', () => {
    const g = state({ hands: [[c(6, 'hearts'), c(8), c(7)], [c(9)]] });
    expect(timeoutAction(g, 0)).toEqual({ type: 'play', cardId: c(7).id });
    expect(timeoutAction(applyAction(g, 0, { type: 'play', cardId: c(7).id }), 1)).toEqual({
      type: 'take',
    });
  });
  it('caps throw-ins by original defender hand', () => {
    const g = state({
      limit: 1,
      phase: 'taking',
      table: [{ attack: c(6) }],
      hands: [[c(6, 'spades')], [c(7)]],
    });
    expect(legalActions(g, 0)).toEqual([{ type: 'finish' }]);
  });
});
