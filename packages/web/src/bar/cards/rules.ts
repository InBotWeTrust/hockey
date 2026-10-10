export type Suit = 'clubs' | 'spades' | 'hearts' | 'diamonds';
export type Player = 0 | 1;
export interface Card {
  id: string;
  rank: number;
  suit: Suit;
}
export interface Pair {
  attack: Card;
  defence?: Card;
}
export type Action =
  | { type: 'play'; cardId: string }
  | { type: 'beat'; cardId: string; target: number }
  | { type: 'take' }
  | { type: 'finish' };
export interface Game {
  hands: [Card[], Card[]];
  deck: Card[];
  trump: Suit;
  trumpCard: Card;
  attacker: Player;
  table: Pair[];
  discard: Card[];
  limit: number;
  phase: 'attack' | 'defend' | 'taking' | 'ended';
  result: Player | 'draw' | null;
  revision: number;
}
export const other = (p: Player): Player => (p === 0 ? 1 : 0);
export const cardOrder = (trump: Suit) => (a: Card, b: Card) =>
  Number(a.suit === trump) - Number(b.suit === trump) ||
  a.rank - b.rank ||
  a.id.localeCompare(b.id);
export function createGame(random = Math.random): Game {
  const cards: Card[] = [];
  for (const suit of ['clubs', 'spades', 'hearts', 'diamonds'] as Suit[])
    for (let rank = 6; rank <= 14; rank++) cards.push({ id: `${suit}-${rank}`, suit, rank });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j]!, cards[i]!];
  }
  const hands: [Card[], Card[]] = [[], []];
  for (let i = 0; i < 12; i++) hands[(i % 2) as Player].push(cards.shift()!);
  const trumpCard = cards[cards.length - 1]!;
  const minimum = hands.map((h) =>
    Math.min(...h.filter((c) => c.suit === trumpCard.suit).map((c) => c.rank)),
  );
  const attacker: Player =
    minimum[0] === minimum[1] ? (random() < 0.5 ? 0 : 1) : minimum[0]! < minimum[1]! ? 0 : 1;
  return {
    hands,
    deck: cards,
    trump: trumpCard.suit,
    trumpCard,
    attacker,
    table: [],
    discard: [],
    limit: 6,
    phase: 'attack',
    result: null,
    revision: 0,
  };
}
export function canBeat(card: Card, attack: Card, trump: Suit): boolean {
  return card.suit === attack.suit
    ? card.rank > attack.rank
    : card.suit === trump && attack.suit !== trump;
}
export function activePlayer(g: Game): Player {
  return g.phase === 'defend' ? other(g.attacker) : g.attacker;
}
export function legalActions(g: Game, p: Player): Action[] {
  if (g.phase === 'ended' || p !== activePlayer(g)) return [];
  if (g.phase === 'defend')
    return [
      ...g.hands[p].flatMap((c) =>
        g.table.flatMap((pair, target) =>
          !pair.defence && canBeat(c, pair.attack, g.trump)
            ? [{ type: 'beat' as const, cardId: c.id, target }]
            : [],
        ),
      ),
      { type: 'take' },
    ];
  const ranks = g.table.flatMap((pair) => [
    pair.attack.rank,
    ...(pair.defence ? [pair.defence.rank] : []),
  ]);
  const actions: Action[] =
    g.table.length < g.limit
      ? g.hands[p]
          .filter((c) => g.table.length === 0 || ranks.includes(c.rank))
          .map((c) => ({ type: 'play', cardId: c.id }))
      : [];
  if (g.table.length > 0 && (g.phase === 'taking' || g.table.every((pair) => pair.defence)))
    actions.push({ type: 'finish' });
  return actions;
}
export function applyAction(g: Game, p: Player, action: Action): Game {
  if (!legalActions(g, p).some((a) => JSON.stringify(a) === JSON.stringify(action))) return g;
  const next: Game = {
    ...g,
    hands: [[...g.hands[0]], [...g.hands[1]]],
    deck: [...g.deck],
    table: g.table.map((pair) => ({ ...pair })),
    discard: [...g.discard],
    revision: g.revision + 1,
  };
  if (action.type === 'play' || action.type === 'beat') {
    const index = next.hands[p].findIndex((c) => c.id === action.cardId);
    const card = next.hands[p].splice(index, 1)[0]!;
    if (action.type === 'play') {
      next.table.push({ attack: card });
      if (next.phase !== 'taking') next.phase = 'defend';
    } else {
      next.table[action.target]!.defence = card;
      if (next.table.every((pair) => pair.defence)) next.phase = 'attack';
    }
  } else if (action.type === 'take') next.phase = 'taking';
  else {
    const defender = other(next.attacker);
    const taking = next.phase === 'taking';
    const tableCards = next.table.flatMap((pair) => [
      pair.attack,
      ...(pair.defence ? [pair.defence] : []),
    ]);
    if (taking) next.hands[defender].push(...tableCards);
    else next.discard.push(...tableCards);
    for (const player of [next.attacker, defender])
      while (next.hands[player].length < 6 && next.deck.length)
        next.hands[player].push(next.deck.shift()!);
    next.table = [];
    if (!next.deck.length) {
      const empty = next.hands.map((h) => h.length === 0);
      if (empty[0] || empty[1]) {
        next.result = empty[0] && empty[1] ? 'draw' : empty[0] ? 0 : 1;
        next.phase = 'ended';
        return next;
      }
    }
    if (!taking) next.attacker = defender;
    next.limit = Math.min(6, next.hands[other(next.attacker)].length);
    next.phase = 'attack';
  }
  return next;
}
export function timeoutAction(g: Game, p: Player): Action | undefined {
  const actions = legalActions(g, p);
  if (g.phase === 'defend') return actions.find((a) => a.type === 'take');
  const cards = [...g.hands[p]].sort(cardOrder(g.trump));
  for (const card of cards) {
    const action = actions.find((a) => a.type === 'play' && a.cardId === card.id);
    if (action) return action;
  }
  return actions.find((a) => a.type === 'finish');
}
