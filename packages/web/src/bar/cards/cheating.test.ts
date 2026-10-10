import { expect, it } from 'vitest';
import { botView, chooseBotAction } from './bot.js';
import { activePlayer, applyAction, createGame } from './rules.js';
import { attemptCheat, catchCheat } from './cheating.js';
it('stages an illegal rank and restores the table without a penalty without losing cards', () => {
  const g = { ...createGame(() => 0.4), attacker: 1 as const, phase: 'attack' as const };
  const attack = g.hands[1].shift()!;
  const defence = g.hands[0].shift()!;
  g.table = [{ attack, defence }];
  const staged = attemptCheat(g)!;
  expect(staged).toBeDefined();
  expect(staged.table).toHaveLength(2);
  expect(staged.table[1]!.attack.rank).not.toBe(attack.rank);
  expect(staged.table[1]!.attack.rank).not.toBe(defence.rank);
  const caught = catchCheat(g, staged);
  expect(caught.table).toEqual(g.table);
  expect(caught.hands).toEqual(g.hands);
  expect(caught.deck).toEqual(g.deck);
  expect(caught.revision).toBeGreaterThan(staged.revision);
  const cards = [
    ...caught.hands.flat(),
    ...caught.deck,
    ...caught.discard,
    ...caught.table.flatMap((p) => [p.attack, ...(p.defence ? [p.defence] : [])]),
  ];
  expect(cards).toHaveLength(36);
  expect(new Set(cards.map((c) => c.id)).size).toBe(36);
});
it('never cheats on the opening attack or beyond the bout limit', () => {
  const g = { ...createGame(() => 0.4), attacker: 1 as const };
  expect(attemptCheat(g)).toBeNull();
  const attack = g.hands[1][0]!;
  expect(attemptCheat({ ...g, table: [{ attack }], limit: 1 })).toBeNull();
});

it('caught and accepted illegal throws preserve full games and all 36 cards', () => {
  for (let seed = 1; seed <= 12; seed++) {
    let n = seed;
    const random = () => (n = (n * 1664525 + 1013904223) >>> 0) / 4294967296;
    let g = createGame(random);
    let attempts = 0;
    for (let step = 0; step < 2000 && g.result === null; step++) {
      const staged = attempts < 2 ? attemptCheat(g) : null;
      if (staged) {
        attempts++;
        g = seed % 2 ? staged : catchCheat(g, staged);
      }
      const p = activePlayer(g);
      g = applyAction(g, p, chooseBotAction(botView(g, p))!);
      const cards = [
        ...g.hands.flat(),
        ...g.deck,
        ...g.discard,
        ...g.table.flatMap((p) => [p.attack, ...(p.defence ? [p.defence] : [])]),
      ];
      expect(cards).toHaveLength(36);
      expect(new Set(cards.map((c) => c.id)).size).toBe(36);
    }
    expect(g.result).not.toBeNull();
  }
});
