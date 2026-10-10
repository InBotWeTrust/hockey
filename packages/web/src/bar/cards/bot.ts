import {
  canBeat,
  cardOrder,
  other,
  type Game,
  type Player,
  type Action,
  type Card,
  type Suit,
  type Pair,
} from './rules.js';
import type { ComputerOpponentId } from './computerOpponents.js';
export interface BotView {
  ownHand: Card[];
  trump: Suit;
  table: Pair[];
  limit: number;
  phase: Game['phase'];
  role: 'attacker' | 'defender';
  opponentCount: number;
  deckCount: number;
  publicCards: Card[];
}
export function botView(g: Game, p: Player): BotView {
  return {
    ownHand: [...g.hands[p]],
    trump: g.trump,
    table: g.table.map((x) => ({ ...x })),
    limit: g.limit,
    phase: g.phase,
    role: p === g.attacker ? 'attacker' : 'defender',
    opponentCount: g.hands[other(p)].length,
    deckCount: g.deck.length,
    publicCards: [
      ...g.discard,
      ...g.table.flatMap((p) => [p.attack, ...(p.defence ? [p.defence] : [])]),
    ],
  };
}
export function chooseBotAction(
  v: BotView,
  profile: ComputerOpponentId = 'maria',
  random = Math.random,
): Action | undefined {
  if (v.phase === 'ended') return undefined;
  const cards = [...v.ownHand].sort(cardOrder(v.trump));
  if (v.role === 'defender') {
    if (profile === 'arsenich') {
      const targets = v.table.map((pair, i) => ({ pair, i })).filter((t) => !t.pair.defence);
      // Search a complete defence assignment using only our hand and public table.
      const assign = (at: number, available: Card[]): Card[] | null => {
        if (at === targets.length) return [];
        for (const card of available) {
          if (!canBeat(card, targets[at]!.pair.attack, v.trump)) continue;
          const rest = assign(
            at + 1,
            available.filter((c) => c.id !== card.id),
          );
          if (rest) return [card, ...rest];
        }
        return null;
      };
      const plan = assign(0, cards);
      if (plan?.[0]) return { type: 'beat', cardId: plan[0].id, target: targets[0]!.i };
      if (targets.length) return { type: 'take' };
    }
    for (let target = 0; target < v.table.length; target++) {
      const pair = v.table[target]!;
      if (!pair.defence) {
        const options = cards.filter((c) => canBeat(c, pair.attack, v.trump));
        const card = profile === 'daria' && random() < 0.25 ? options.at(-1) : options[0];
        return card ? { type: 'beat', cardId: card.id, target } : { type: 'take' };
      }
    }
    return undefined;
  }
  const ranks = v.table.flatMap((pair) => [
    pair.attack.rank,
    ...(pair.defence ? [pair.defence.rank] : []),
  ]);
  if (v.table.length < v.limit) {
    let options = cards.filter((c) => !v.table.length || ranks.includes(c.rank));
    if (profile === 'daria' && v.table.length && random() < 0.3) return { type: 'finish' };
    if (profile === 'grigory') options = [...options].sort((a, b) => b.rank - a.rank);
    if (profile === 'arsenich' && !v.table.length) {
      // Discard history estimates remaining higher cards; no hidden hands or deck order.
      const cost = (c: Card) =>
        (c.suit === v.trump ? 30 : 0) +
        c.rank +
        (v.deckCount === 0
          ? Array.from({ length: 14 - c.rank }, (_, i) => c.rank + i + 1).filter(
              (rank) =>
                !v.publicCards.some((p) => p.suit === c.suit && p.rank === rank) &&
                !v.ownHand.some((p) => p.suit === c.suit && p.rank === rank),
            ).length * 3
          : 0);
      options.sort((a, b) => cost(a) - cost(b));
    }
    const card = options[0];
    if (card) return { type: 'play', cardId: card.id };
  }
  return v.table.length ? { type: 'finish' } : undefined;
}
