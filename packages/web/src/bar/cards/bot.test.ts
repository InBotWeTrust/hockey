import { expect, it } from 'vitest';
import { createGame, applyAction, activePlayer, legalActions } from './rules.js';
import { botView, chooseBotAction } from './bot.js';
it('plays seeded complete games without hidden information or lost cards', () => {
  for (let seed = 1; seed <= 40; seed++) {
    let n = seed;
    const random = () => {
      n = (n * 1664525 + 1013904223) >>> 0;
      return n / 4294967296;
    };
    let g = createGame(random);
    let moves = 0;
    while (g.result === null && moves++ < 3000) {
      const p = activePlayer(g);
      const view = botView(g, p);
      expect(view).not.toHaveProperty('deck');
      expect(view).not.toHaveProperty('hands');
      const action = chooseBotAction(view);
      expect(legalActions(g, p)).toContainEqual(action);
      g = applyAction(g, p, action!);
      const all = [
        ...g.hands.flat(),
        ...g.deck,
        ...g.discard,
        ...g.table.flatMap((x) => [x.attack, ...(x.defence ? [x.defence] : [])]),
      ];
      expect(all).toHaveLength(36);
      expect(new Set(all.map((c) => c.id)).size).toBe(36);
    }
    expect(g.result).not.toBeNull();
  }
});
