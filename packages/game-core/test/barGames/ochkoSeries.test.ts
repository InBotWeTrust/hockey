import { expect, it } from 'vitest';
import * as series from '../../src/barGames/ochkoSeries.js';
const deck = Array.from({ length: 36 }, (_, i) => 35 - i);
it('plays four rounds with a single deck and settles only after the fourth review', () => {
  let g = series.create(deck, 0, true, 0);
  const used: number[] = [];
  for (let round = 1; round <= 4; round++) {
    const now = g.dealUntil[0];
    used.push(...g.hands.flat());
    if (!g.done[0]) g = series.act(g, 0, 'stand', round, now);
    if (!g.done[1]) g = series.act(g, 1, 'stand', round, now);
    g = series.advance(g, g.series.reviewAt);
    expect(g.winner).toBe(null);
    g = series.act(g, 0, 'next', round, g.series.reviewAt);
  }
  expect(new Set(used).size).toBe(16);
  expect(g.series.phase).toBe('finished');
  expect(g.winner).not.toBe(null);
});
it('rejects delayed previous-round commands and never exposes deck or cheating budget', () => {
  let g = series.create(deck, 0, true, 4);
  g = series.act(g, 0, 'stand', 1, 1400);
  g = series.act(g, 1, 'stand', 1, 1400);
  g = series.advance(g, g.series.reviewAt);
  const v = series.view(g, 0, g.series.reviewAt);
  expect('deck' in v).toBe(false);
  expect('cheatBudget' in v).toBe(false);
  g = series.act(g, 0, 'next', 1, g.series.reviewAt);
  expect(() => series.act(g, 0, 'stand', 1, 10000)).toThrow();
});
it('keeps opponent total hidden until all cards are revealed', () => {
  let g = series.create(deck, 0, true, 0);
  g = series.act(g, 0, 'stand', 1, 1400);
  g = series.act(g, 1, 'stand', 1, 1400);
  expect(series.view(g, 0, g.series.reviewAt - 1).scores[1]).toBe(-1);
  expect(series.view(g, 0, g.series.reviewAt).scores[1]).toBeGreaterThanOrEqual(0);
});
it('forfeits an intermediate character review but auto-settles the final review', () => {
  let g = series.create(deck, 0, true, 0);
  g = series.act(g, 0, 'stand', 1, 1400);
  g = series.act(g, 1, 'stand', 1, 1400);
  g = series.advance(g, g.series.reviewUntil);
  expect(g.winner).toBe(1);
});
it('online readiness expires as a technical draw when nobody confirms', () => {
  let g = series.create(deck, 0, false, 0);
  g = series.act(g, 0, 'stand', 1, 1400);
  g = series.act(g, 1, 'stand', 1, 1400);
  g = series.advance(g, g.series.reviewUntil);
  expect(g.winner).toBe('draw');
  expect(g.series.totals).toEqual([0, 0]);
  expect(g.series.history).toHaveLength(1);
});
it('corrects a real overcount and penalizes a false challenge, including negative totals', () => {
  for (const seed of [0, 40]) {
    let g = series.create(deck, 0, true, seed);
    g = series.act(g, 0, 'stand', 1, 1400);
    g = series.act(g, 1, 'stand', 1, 1400);
    g = series.advance(g, g.series.reviewAt);
    const before = g.series.totals[1];
    g.series.totals[0] = 0;
    g = series.act(g, 0, 'challenge', 1, g.series.reviewAt);
    if (seed === 0) {
      expect(g.series.totals[0]).toBe(-3);
      expect(g.series.challengeResult).toBe('wrong');
    } else {
      expect(g.series.totals[1]).toBeLessThan(before);
      expect(g.series.challengeResult).toBe('correct');
    }
    expect(() => series.act(g, 0, 'challenge', 1, g.series.reviewAt)).toThrow();
  }
});
it('online starts only after both confirmations and five seconds, or awards a technical 21:0', () => {
  let g = series.create(deck, 0, false, 0);
  g = series.act(g, 0, 'stand', 1, 1400);
  g = series.act(g, 1, 'stand', 1, 1400);
  g = series.advance(g, g.series.reviewAt);
  g = series.act(g, 0, 'next', 1, g.series.reviewAt);
  const expired = series.advance(g, g.series.reviewUntil);
  expect(expired.series.totals).toEqual([21, 0]);
  expect(expired.winner).toBe(0);
  g = series.act(g, 1, 'next', 1, g.series.reviewAt);
  expect(series.advance(g, g.series.nextAt - 1).series.round).toBe(1);
  expect(series.advance(g, g.series.nextAt).series.round).toBe(2);
});
it('keeps a two-ace hand at 21 while the other player continues', () => {
  const cards = [...deck.filter((c) => c !== 32 && c !== 33), 33, 32];
  const g = series.create(cards, 0, true, 0);
  expect(g.scores[0]).toBe(21);
  expect(g.done).toEqual([true, false]);
  expect(g.winner).toBe(null);
});
it('reserves future initial hands and never deals the same card twice under repeated hits', () => {
  let g = series.create(deck, 0, true, 0),
    now = 1400;
  const used: number[] = [];
  for (let round = 1; round <= 4; round++) {
    for (let i = 0; i < 36 && g.series.phase === 'play'; i++) {
      now = Math.max(now, ...g.dealUntil);
      const p = (!g.done[0] ? 0 : 1) as 0 | 1;
      if (g.done[p]) break;
      g = series.act(g, p, 'hit', round, now);
      expect(g.deck.length).toBeGreaterThanOrEqual(4 * (4 - round));
    }
    used.push(...g.hands.flat());
    expect(new Set(used).size).toBe(used.length);
    now = g.series.reviewAt;
    g = series.advance(g, now);
    g = series.act(g, 0, 'next', round, now);
  }
  expect(g.series.history).toHaveLength(4);
  expect(used.length).toBeLessThanOrEqual(36);
});
it('uses the agreed cheating budget distribution and auto-settles the fourth character review', () => {
  const counts = [0, 0, 0];
  for (let seed = 0; seed < 100; seed++) counts[series.create(deck, 0, true, seed).cheatBudget]!++;
  expect(counts).toEqual([40, 55, 5]);
  let g = series.create(deck, 0, true, 0);
  for (let round = 1; round <= 4; round++) {
    const now = Math.max(...g.dealUntil);
    for (const p of [0, 1] as const) if (!g.done[p]) g = series.act(g, p, 'stand', round, now);
    g = series.advance(g, g.series.reviewAt);
    if (round < 4) g = series.act(g, 0, 'next', round, g.series.reviewAt);
  }
  const end = series.advance(g, g.series.reviewUntil);
  expect(end.winner).not.toBeNull();
  expect(end.series.totals).toEqual(g.series.totals);
  expect(end.series.history).toHaveLength(4);
});
