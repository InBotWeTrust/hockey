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
export interface BotView {
  ownHand: Card[];
  trump: Suit;
  table: Pair[];
  limit: number;
  phase: Game['phase'];
  role: 'attacker' | 'defender';
  opponentCount: number;
  deckCount: number;
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
  };
}
export function chooseBotAction(v: BotView): Action | undefined {
  if (v.phase === 'ended') return undefined;
  const cards = [...v.ownHand].sort(cardOrder(v.trump));
  if (v.role === 'defender') {
    for (let target = 0; target < v.table.length; target++) {
      const pair = v.table[target]!;
      if (!pair.defence) {
        const card = cards.find((c) => canBeat(c, pair.attack, v.trump));
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
    const card = cards.find((c) => !v.table.length || ranks.includes(c.rank));
    if (card) return { type: 'play', cardId: card.id };
  }
  return v.table.length ? { type: 'finish' } : undefined;
}
