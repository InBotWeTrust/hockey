import type { Player, Winner } from './darts.js';
export const OCHKO_TURN_MS = 40000;
export const OCHKO_DEAL_MS = 350;
export interface OchkoView {
  kind: 'ochko';
  // Compatibility metadata only; both players act independently.
  turn: Player;
  hands: [number[], number[]];
  scores: [number, number];
  done: [boolean, boolean];
  actionSeq: [number, number];
  deadlines: [number, number];
  dealUntil: [number, number];
  winner: Winner;
  golden: [boolean, boolean];
}
export interface OchkoState extends OchkoView {
  deck: number[];
}
export function cardPoints(card: number): number {
  if (!Number.isInteger(card) || card < 0 || card > 35) throw new Error('Invalid card');
  return [6, 7, 8, 9, 10, 2, 3, 4, 11][Math.floor(card / 4)]!;
}
const total = (hand: number[]) => hand.reduce((n, c) => n + cardPoints(c), 0);
export function createOchko(seed: number, now: number): OchkoState {
  const deck = Array.from({ length: 36 }, (_, i) => i);
  let rng = seed >>> 0;
  for (let i = 35; i > 0; i--) {
    rng = (Math.imul(1664525, rng) + 1013904223) >>> 0;
    const j = Math.floor((rng / 4294967296) * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return createOchkoFromDeck(deck, now);
}
export function createOchkoFromDeck(cards: readonly number[], now: number): OchkoState {
  if (
    cards.length !== 36 ||
    new Set(cards).size !== 36 ||
    cards.some((c) => !Number.isInteger(c) || c < 0 || c > 35)
  )
    throw new Error('Invalid deck');
  const deck = [...cards];
  const hands: [number[], number[]] = [
    [deck.pop()!, deck.pop()!],
    [deck.pop()!, deck.pop()!],
  ];
  const dealing = now + OCHKO_DEAL_MS * 2;
  return advanceOchko(
    {
      kind: 'ochko',
      turn: 0,
      deck,
      hands,
      scores: [total(hands[0]), total(hands[1])],
      done: [false, false],
      actionSeq: [0, 0],
      deadlines: [dealing + OCHKO_TURN_MS, dealing + OCHKO_TURN_MS],
      dealUntil: [dealing, dealing],
      winner: null,
      golden: [false, false],
    },
    now,
  );
}
export function advanceOchko(g: OchkoState, now: number): OchkoState {
  if (g.winner !== null) return g;
  const golden: [boolean, boolean] = g.hands.map(
    (h) => h.length === 2 && h.every((c) => cardPoints(c) === 11),
  ) as [boolean, boolean];
  const done: [boolean, boolean] = g.done.map(
    (d, p) => d || now >= g.deadlines[p]! || g.scores[p]! >= 21 || g.deck.length === 0,
  ) as [boolean, boolean];
  let winner: Winner = null;
  if (golden.some(Boolean)) winner = golden[0] && golden[1] ? 'draw' : golden[0] ? 0 : 1;
  else if (done.every(Boolean)) {
    const a = g.scores[0] > 21 ? -1 : g.scores[0],
      b = g.scores[1] > 21 ? -1 : g.scores[1];
    winner = a === b ? 'draw' : a > b ? 0 : 1;
  }
  if (winner !== null) {
    done[0] = true;
    done[1] = true;
  }
  if (
    winner === g.winner &&
    done.every((d, p) => d === g.done[p]) &&
    golden.every((v, p) => v === g.golden[p])
  )
    return g;
  return { ...g, done, winner, golden };
}
export function actOchko(
  state: OchkoState,
  p: Player,
  action: 'hit' | 'stand' | 'surrender',
  now: number,
): OchkoState {
  const g = advanceOchko(state, now);
  if (g.winner !== null) throw new Error('Finished ochko');
  if (action === 'surrender') return { ...g, winner: p === 0 ? 1 : 0, done: [true, true] };
  if (g.done[p] || now < g.dealUntil[p]) throw new Error('Inactive hand');
  const n: OchkoState = {
    ...g,
    deck: [...g.deck],
    hands: [[...g.hands[0]], [...g.hands[1]]],
    scores: [...g.scores],
    done: [...g.done],
    actionSeq: [...g.actionSeq],
    deadlines: [...g.deadlines],
    dealUntil: [...g.dealUntil],
  };
  n.actionSeq[p]++;
  if (action === 'stand') n.done[p] = true;
  else {
    const card = n.deck.pop();
    if (card === undefined) throw new Error('Empty deck');
    n.hands[p].push(card);
    n.scores[p] = total(n.hands[p]);
    n.dealUntil[p] = now + OCHKO_DEAL_MS;
    n.deadlines[p] += OCHKO_DEAL_MS;
  }
  return advanceOchko(n, now);
}
export function ochkoView(g: OchkoState, p: Player): OchkoView {
  const { deck: _deck, ...v } = g;
  void _deck;
  const other = p === 0 ? 1 : 0;
  const hands: [number[], number[]] = [[...g.hands[0]], [...g.hands[1]]],
    scores: [number, number] = [...g.scores];
  if (g.winner === null) {
    hands[other] = hands[other].map(() => -1);
    scores[other] = -1;
  }
  return { ...v, hands, scores };
}
