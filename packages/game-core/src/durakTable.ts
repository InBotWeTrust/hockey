import { canBeat, cardOrder, type Card, type Pair, type Suit } from './durak.js';

export type TableAction =
  | { type: 'play'; cardId: string }
  | { type: 'beat'; cardId: string; target: number }
  | { type: 'take' }
  | { type: 'pass' };
export interface TableGame {
  version: 1;
  hands: Card[][];
  status: ('playing' | 'won' | 'left' | 'lost')[];
  deck: Card[];
  trump: Suit;
  trumpCard: Card;
  attacker: number;
  defender: number;
  turn: number;
  throwers: number[];
  table: Pair[];
  discard: Card[];
  removed: Card[];
  limit: number;
  bout: number;
  taking: boolean;
  phase: 'attack' | 'defend' | 'throw' | 'ended';
  revision: number;
}
export function createTable(seats: number, random: () => number): TableGame {
  if (!Number.isInteger(seats) || seats < 2 || seats > 6) throw new Error('Invalid seat count');
  const deck: Card[] = [];
  for (const suit of ['clubs', 'spades', 'hearts', 'diamonds'] as Suit[])
    for (let rank = 6; rank <= 14; rank++) deck.push({ id: `${suit}-${rank}`, suit, rank });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  // Capture before dealing: with six players the entire deck is dealt.
  const trumpCard = deck[deck.length - 1]!;
  const hands = Array.from({ length: seats }, () => [] as Card[]);
  for (let i = 0; i < seats * 6; i++) hands[i % seats]!.push(deck.shift()!);
  const minimum = hands.map((h) =>
    Math.min(...h.filter((c) => c.suit === trumpCard.suit).map((c) => c.rank)),
  );
  const lowest = Math.min(...minimum);
  const attacker = lowest === Infinity ? 0 : minimum.indexOf(lowest);
  const defender = (attacker + 1) % seats;
  return {
    version: 1,
    hands,
    status: Array(seats).fill('playing'),
    deck,
    trump: trumpCard.suit,
    trumpCard,
    attacker,
    defender,
    turn: attacker,
    throwers: [],
    table: [],
    discard: [],
    removed: [],
    limit: 5,
    bout: 0,
    taking: false,
    phase: 'attack',
    revision: 0,
  };
}
function clockwise(g: TableGame, start: number): number[] {
  return Array.from({ length: g.hands.length }, (_, i) => (start + i) % g.hands.length).filter(
    (p) => g.status[p] === 'playing',
  );
}
function nextPlayer(g: TableGame, p: number): number {
  return clockwise(g, (p + 1) % g.hands.length)[0] ?? p;
}
function copy(g: TableGame): TableGame {
  return {
    ...g,
    hands: g.hands.map((h) => [...h]),
    status: [...g.status],
    deck: [...g.deck],
    table: g.table.map((p) => ({ ...p })),
    discard: [...g.discard],
    removed: [...g.removed],
    throwers: [...g.throwers],
    revision: g.revision + 1,
  };
}
export function legal(g: TableGame, p: number): TableAction[] {
  if (g.phase === 'ended' || g.turn !== p || g.status[p] !== 'playing') return [];
  if (g.phase === 'defend')
    return [
      ...g.hands[p]!.flatMap((c) =>
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
  const actions: TableAction[] =
    g.table.length < g.limit
      ? g.hands[p]!.filter((c) => !g.table.length || ranks.includes(c.rank)).map((c) => ({
          type: 'play',
          cardId: c.id,
        }))
      : [];
  if (g.phase === 'throw') actions.push({ type: 'pass' });
  return actions;
}
function finishGame(g: TableGame, forfeit = false): boolean {
  const playing = g.status.flatMap((s, p) => (s === 'playing' ? [p] : []));
  if (playing.length > 1) return false;
  if (playing.length === 1)
    g.status[playing[0]!] = !forfeit && g.hands[playing[0]!]!.length ? 'lost' : 'won';
  g.phase = 'ended';
  return true;
}
function settle(g: TableGame) {
  const defender = g.defender;
  const taking = g.taking;
  const cards = g.table.flatMap((pair) => [pair.attack, ...(pair.defence ? [pair.defence] : [])]);
  if (taking && g.status[defender] === 'playing') g.hands[defender]!.push(...cards);
  else g.discard.push(...cards);
  for (const p of [...clockwise(g, g.attacker).filter((p) => p !== defender), defender]) {
    if (g.status[p] !== 'playing') continue;
    while (g.hands[p]!.length < 6 && g.deck.length) g.hands[p]!.push(g.deck.shift()!);
  }
  g.table = [];
  if (!g.deck.length)
    g.status.forEach((s, p) => {
      if (s === 'playing' && !g.hands[p]!.length) g.status[p] = 'won';
    });
  if (finishGame(g)) return;
  g.attacker = !taking && g.status[defender] === 'playing' ? defender : nextPlayer(g, defender);
  g.defender = nextPlayer(g, g.attacker);
  g.turn = g.attacker;
  g.bout++;
  g.limit = Math.min(6, g.hands[g.defender]!.length);
  g.throwers = [];
  g.taking = false;
  g.phase = 'attack';
}
function throwing(g: TableGame) {
  g.phase = 'throw';
  if (!g.throwers.length) g.throwers = clockwise(g, g.attacker).filter((p) => p !== g.defender);
  g.turn = g.throwers[0]!;
}
export function apply(g: TableGame, p: number, action: TableAction): TableGame {
  if (!legal(g, p).some((a) => JSON.stringify(a) === JSON.stringify(action))) return g;
  const n = copy(g);
  if (action.type === 'play' || action.type === 'beat') {
    const index = n.hands[p]!.findIndex((c) => c.id === action.cardId);
    const card = n.hands[p]!.splice(index, 1)[0]!;
    if (action.type === 'play') {
      n.table.push({ attack: card });
      if (!n.throwers.length) n.throwers = clockwise(n, n.attacker).filter((s) => s !== n.defender);
      if (!n.taking) {
        n.phase = 'defend';
        n.turn = n.defender;
      } else if (n.table.length >= n.limit) settle(n);
    } else {
      n.table[action.target]!.defence = card;
      if (n.table.every((pair) => pair.defence)) {
        if (n.table.length >= n.limit) settle(n);
        else throwing(n);
      }
    }
  } else if (action.type === 'take') {
    n.taking = true;
    if (n.table.length >= n.limit) settle(n);
    else throwing(n);
  } else {
    n.throwers.shift();
    if (!n.throwers.length) settle(n);
    else n.turn = n.throwers[0]!;
  }
  return n;
}
export function timeout(g: TableGame): TableAction | undefined {
  if (g.phase === 'throw') return { type: 'pass' };
  if (g.phase === 'defend') return { type: 'take' };
  const actions = legal(g, g.turn);
  for (const c of [...g.hands[g.turn]!].sort(cardOrder(g.trump))) {
    const action = actions.find((a) => a.type === 'play' && a.cardId === c.id);
    if (action) return action;
  }
  return undefined;
}
export function surrender(g: TableGame, p: number): TableGame {
  if (g.phase === 'ended' || g.status[p] !== 'playing') return g;
  const n = copy(g);
  n.removed.push(...n.hands[p]!);
  n.hands[p] = [];
  n.status[p] = 'left';
  n.throwers = n.throwers.filter((s) => s !== p);
  if (finishGame(n, true)) {
    n.discard.push(
      ...n.table.flatMap((pair) => [pair.attack, ...(pair.defence ? [pair.defence] : [])]),
    );
    n.table = [];
  } else if (p === n.defender || (p === n.attacker && !n.table.length)) settle(n);
  else if (p === n.turn) {
    if (n.throwers.length) n.turn = n.throwers[0]!;
    else settle(n);
  }
  return n;
}
export const turnDuration = (g: TableGame) => (g.phase === 'throw' ? 5000 : 20000);
