import { describe, expect, it } from 'vitest';
import { createRng } from '../src/rng.js';
import * as table from '../src/durakTable.js';

describe('multi-seat durak', () => {
  for (const seats of [2, 3, 4, 5, 6])
    it(`deals ${seats} seats deterministically`, () => {
      const g = table.createTable(seats, createRng('42').next);
      expect(g).toEqual(table.createTable(seats, createRng('42').next));
      expect(g.hands.map((h) => h.length)).toEqual(Array(seats).fill(6));
      expect(g.deck.length).toBe(36 - 6 * seats);
      expect(g.trumpCard.suit).toBe(g.trump);
      expect(new Set([...g.hands.flat(), ...g.deck].map((c) => c.id)).size).toBe(36);
      expect(g.limit).toBe(5);
    });
  it('rejects unsupported seats', () => {
    expect(() => table.createTable(7, createRng('1').next)).toThrow();
  });
  it('passes throw-in rights clockwise, excluding the defender', () => {
    let g = table.createTable(4, createRng('1').next);
    const attacker = g.attacker;
    g = table.apply(g, attacker, { type: 'play', cardId: g.hands[attacker]![0]!.id });
    expect(g.turn).toBe(g.defender);
    g = table.apply(g, g.defender, { type: 'take' });
    expect(g.turn).toBe(attacker);
    expect(table.timeout(g)).toEqual({ type: 'pass' });
    const before = g;
    g = table.apply(g, g.turn, { type: 'pass' });
    expect(g.turn).not.toBe(before.turn);
    expect(g.turn).not.toBe(g.defender);
    expect(table.apply(g, before.turn, { type: 'pass' })).toBe(g);
  });
  it('settles a taken bout only after all throwers pass', () => {
    let g = table.createTable(3, createRng('2').next);
    const defender = g.defender;
    g = table.apply(g, g.turn, table.timeout(g)!);
    g = table.apply(g, g.turn, { type: 'take' });
    g = table.apply(g, g.turn, { type: 'pass' });
    expect(g.table).toHaveLength(1);
    g = table.apply(g, g.turn, { type: 'pass' });
    expect(g.table).toHaveLength(0);
    expect(g.hands[defender]!.length).toBe(7);
    expect(g.attacker).toBe((defender + 1) % 3);
    expect(g.limit).toBe(6);
  });
  it('surrender removes cards and allows remaining players to continue', () => {
    const g = table.createTable(4, createRng('3').next);
    const next = table.surrender(g, g.defender);
    expect(next.status[g.defender]).toBe('left');
    expect(next.hands[g.defender]).toEqual([]);
    expect(next.removed).toHaveLength(6);
    expect(next.phase).not.toBe('ended');
    expect(next.status[next.turn]).toBe('playing');
    expect(table.surrender(next, g.defender)).toBe(next);
  });
  it('awards the last remaining player a win when others surrender', () => {
    const g = table.createTable(2, createRng('forfeit').next);
    const next = table.surrender(g, 0);
    expect(next.phase).toBe('ended');
    expect(next.status).toEqual(['left', 'won']);
  });
  it('plays valid timed actions to completion and conserves every card', () => {
    for (const seats of [2, 3, 6]) {
      let g = table.createTable(seats, createRng('11').next);
      for (let i = 0; i < 20000 && g.phase !== 'ended'; i++) {
        const legal = table.legal(g, g.turn);
        const action = legal.find((a) => a.type === 'beat') ?? table.timeout(g);
        expect(action).toBeDefined();
        g = table.apply(g, g.turn, action!);
      }
      expect(g.phase).toBe('ended');
      const cards = [
        ...g.hands.flat(),
        ...g.deck,
        ...g.discard,
        ...g.removed,
        ...g.table.flatMap((p) => [p.attack, ...(p.defence ? [p.defence] : [])]),
      ];
      expect(cards).toHaveLength(36);
      expect(new Set(cards.map((c) => c.id)).size).toBe(36);
    }
  });
});

it.each([2, 3, 4, 5, 6])('gives %i players 40 seconds on an opening attack and 30 on each response', seats => {
  let g = table.createTable(seats, createRng('clock').next);
  expect(table.turnDuration(g)).toBe(40000);
  g = table.apply(g, g.turn, table.timeout(g)!);
  expect(table.turnDuration(g)).toBe(30000);
  g = table.apply(g, g.turn, { type: 'take' });
  expect(table.turnDuration(g)).toBe(30000);
});
it('closes an empty thrower automatically in three seconds but retains other players', () => {
  const g = table.createTable(3, createRng('final').next);
  const ace = { id: 'clubs-14', suit: 'clubs' as const, rank: 14 };
  const next = { ...g, deck: [], hands: [[], [{ id: 'hearts-6', rank: 6, suit: 'hearts' as const }], [{ id: 'hearts-7', rank: 7, suit: 'hearts' as const }]], table: [{ attack: ace }], attacker: 0, defender: 1, turn: 0, throwers: [0, 2], taking: true, phase: 'throw' as const };
  expect(table.turnDuration(next)).toBe(3000);
  const passed = table.apply(next, 0, table.timeout(next)!);
  expect(passed.turn).toBe(2);
  expect(passed.phase).toBe('throw');
  expect(table.turnDuration(passed)).toBe(30000);
});

it('keeps the defender decision when a final attack can still be beaten', () => {
  const g = table.createTable(2, createRng('beatable').next);
  const next = { ...g, attacker: 0, defender: 1, turn: 1, phase: 'defend' as const, deck: [],
    hands: [[], [{ id: 'clubs-14', rank: 14, suit: 'clubs' as const }]], trump: 'clubs' as const,
    table: [{ attack: { id: 'clubs-13', rank: 13, suit: 'clubs' as const } }] };
  expect(table.turnDuration(next)).toBe(30000);
  expect(table.legal(next, 1).map(a => a.type)).toEqual(['beat', 'take']);
});
