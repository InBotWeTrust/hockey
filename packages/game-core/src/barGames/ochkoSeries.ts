import { cardPoints, createOchkoFromDeck, type OchkoState, type OchkoView } from './ochko.js';
import type { Player, Winner } from './darts.js';
export interface Round {
  round: number;
  hands: [number[], number[]];
  awards: [number, number];
  challenged: boolean;
}
export interface Series {
  round: number;
  phase: 'play' | 'reveal' | 'review' | 'countdown' | 'finished';
  totals: [number, number];
  history: Round[];
  ready: [boolean, boolean];
  revealAt: number;
  reviewAt: number;
  reviewUntil: number;
  nextAt: number;
  declared: number;
  challenged: boolean;
  challengeResult: 'correct' | 'wrong' | null;
  technical: boolean;
}
export interface State extends OchkoState {
  series: Series;
  character: boolean;
  cheatBudget: number;
  cheatSeed: number;
  actualAward: number;
  stoppedAt: [number | null, number | null];
}
export interface View extends OchkoView {
  series: Series;
}
const pair = <T>(a: T, b: T): [T, T] => [a, b];
const total = (h: number[]) =>
  h.length === 2 && h.every((c) => cardPoints(c) === 11)
    ? 21
    : h.reduce((a, c) => a + cardPoints(c), 0);
const award = (n: number) => (n <= 21 ? n : 0);
function rng(g: State) {
  g.cheatSeed = (Math.imul(g.cheatSeed, 1664525) + 1013904223) >>> 0;
  return g.cheatSeed / 4294967296;
}
export function create(
  cards: readonly number[],
  now: number,
  character: boolean,
  seed: number,
): State {
  const base = createOchkoFromDeck(cards, now);
  const chance = (seed >>> 0) % 100;
  const g: State = {
    ...base,
    winner: null,
    done: [false, false],
    golden: [false, false],
    character,
    cheatBudget: chance < 40 ? 0 : chance < 95 ? 1 : 2,
    cheatSeed: seed,
    actualAward: 0,
    stoppedAt: [null, null],
    series: {
      round: 1,
      phase: 'play',
      totals: [0, 0],
      history: [],
      ready: [false, false],
      revealAt: 0,
      reviewAt: 0,
      reviewUntil: 0,
      nextAt: 0,
      declared: 0,
      challenged: false,
      challengeResult: null,
      technical: false,
    },
  };
  g.scores = g.hands.map(total) as [number, number];
  g.dealUntil = [now + 1400, now + 1400];
  g.deadlines = [now + 41400, now + 41400];
  return advance(g, now);
}
function copy(g: State): State {
  return {
    ...g,
    stoppedAt: [...g.stoppedAt],
    deck: [...g.deck],
    hands: [[...g.hands[0]], [...g.hands[1]]],
    scores: [...g.scores],
    done: [...g.done],
    actionSeq: [...g.actionSeq],
    deadlines: [...g.deadlines],
    dealUntil: [...g.dealUntil],
    golden: [...g.golden],
    series: {
      ...g.series,
      totals: [...g.series.totals],
      ready: [...g.series.ready],
      history: [...g.series.history],
    },
  };
}
function record(g: State) {
  if (g.series.history.some((h) => h.round === g.series.round)) return;
  g.series.history.push({
    round: g.series.round,
    hands: [[...g.hands[0]], [...g.hands[1]]],
    awards: [award(g.scores[0]), award(g.series.declared)],
    challenged: g.series.challenged,
  });
}
function finish(g: State, winner?: Winner) {
  record(g);
  g.series.phase = 'finished';
  g.winner =
    winner ??
    (g.series.totals[0] === g.series.totals[1]
      ? 'draw'
      : g.series.totals[0] > g.series.totals[1]
        ? 0
        : 1);
  g.done = [true, true];
  return g;
}
function nextRound(g: State, now: number) {
  record(g);
  g.series = {
    ...g.series,
    round: g.series.round + 1,
    phase: 'play',
    ready: [false, false],
    revealAt: 0,
    reviewAt: 0,
    reviewUntil: 0,
    nextAt: 0,
    declared: 0,
    challenged: false,
    challengeResult: null,
  };
  g.hands = [
    [g.deck.pop()!, g.deck.pop()!],
    [g.deck.pop()!, g.deck.pop()!],
  ];
  g.scores = g.hands.map(total) as [number, number];
  g.done = [false, false];
  g.stoppedAt = [null, null];
  g.golden = g.hands.map((h) => h.length === 2 && h.every((c) => cardPoints(c) === 11)) as [
    boolean,
    boolean,
  ];
  g.dealUntil = [now + 1400, now + 1400];
  g.deadlines = [now + 41400, now + 41400];
  return g;
}
export function advance(state: State, now: number): State {
  if (state.winner !== null) return state;
  const g = copy(state),
    s = g.series;
  if (s.phase === 'countdown') {
    if (now >= s.nextAt) return advance(nextRound(g, s.nextAt), now);
    return g;
  }
  if (s.phase === 'play') {
    g.golden = g.hands.map((h) => h.length === 2 && h.every((c) => cardPoints(c) === 11)) as [
      boolean,
      boolean,
    ];
    for (const p of [0, 1] as const) {
      if (
        !g.done[p] &&
        (g.scores[p] >= 21 || g.deck.length <= 4 * (4 - s.round) || now >= g.deadlines[p])
      ) {
        g.done[p] = true;
        g.stoppedAt[p] =
          g.scores[p] >= 21 || g.deck.length <= 4 * (4 - s.round)
            ? Math.max(...g.dealUntil)
            : g.deadlines[p];
      }
    }
    if (g.done.every(Boolean)) {
      s.phase = 'reveal';
      g.actualAward = g.scores[1];
      s.declared = g.actualAward;
      if (g.character && g.cheatBudget > 0 && g.actualAward > 0 && g.actualAward < 21) {
        s.declared += Math.min(21 - g.actualAward, 1 + Math.floor(rng(g) * 3));
        g.cheatBudget--;
      }
      s.totals = [s.totals[0] + award(g.scores[0]), s.totals[1] + award(s.declared)];
      s.revealAt = Math.max(...g.stoppedAt.map((t) => t ?? now), ...g.dealUntil) + 1000;
      s.reviewAt = s.revealAt + Math.max(...g.hands.map((h) => h.length)) * 500;
      s.reviewUntil = s.reviewAt + (g.character ? 180000 : 30000);
    }
  }
  if (s.phase === 'reveal' && now >= s.reviewAt) {
    s.phase = 'review';
    if (!g.character && s.round === 4) return finish(g);
  }
  if (s.phase === 'review' && now >= s.reviewUntil) {
    if (g.character) return s.round === 4 ? finish(g) : finish(g, 1);
    record(g);
    s.technical = true;
    s.totals = s.ready[0] !== s.ready[1] ? (s.ready[0] ? [21, 0] : [0, 21]) : [0, 0];
    return finish(g, s.ready[0] !== s.ready[1] ? (s.ready[0] ? 0 : 1) : 'draw');
  }
  return g;
}
export function act(
  state: State,
  p: Player,
  action: 'hit' | 'stand' | 'next' | 'challenge',
  round: number,
  now: number,
): State {
  const g = advance(state, now),
    s = g.series;
  if (g.winner !== null || round !== s.round) throw Error('Stale round');
  if (action === 'next' || action === 'challenge') {
    if (s.phase !== 'review') throw Error('Not reviewing');
    if (action === 'challenge') {
      if (!g.character || p !== 0 || s.challenged) throw Error('Unavailable challenge');
      s.challenged = true;
      if (s.declared !== g.actualAward) {
        s.totals[1] += g.actualAward - s.declared;
        s.declared = g.actualAward;
        s.challengeResult = 'correct';
      } else {
        s.totals[0] -= 3;
        s.challengeResult = 'wrong';
      }
      return g;
    }
    if (g.character) {
      if (p !== 0) throw Error('Unavailable continuation');
      return s.round === 4 ? finish(g) : advance(nextRound(g, now), now);
    }
    if (s.ready[p]) throw Error('Already ready');
    s.ready[p] = true;
    if (s.ready.every(Boolean)) {
      s.phase = 'countdown';
      s.nextAt = now + 5000;
    }
    return g;
  }
  if (s.phase !== 'play' || g.done[p] || now < g.dealUntil[p]) throw Error('Inactive hand');
  g.actionSeq[p]++;
  if (action === 'stand') {
    g.done[p] = true;
    g.stoppedAt[p] = now;
  } else {
    if (g.deck.length <= 4 * (4 - s.round)) throw Error('Reserved deck');
    g.hands[p].push(g.deck.pop()!);
    g.scores[p] = total(g.hands[p]);
    g.dealUntil[p] = now + 700;
    g.deadlines[p] += 700;
  }
  return advance(g, now);
}
export function view(g: State, p: Player, now: number): View {
  const other = p === 0 ? 1 : 0,
    shown = now >= g.series.reviewAt && g.series.phase !== 'play';
  const hands: [number[], number[]] = [[...g.hands[0]], [...g.hands[1]]];
  if (!shown) {
    const count =
      g.series.phase === 'reveal' ? Math.max(0, Math.floor((now - g.series.revealAt) / 500)) : 0;
    hands[other] = hands[other].map((c, i) => (i < count ? c : -1));
  }
  const scores: [number, number] = [...g.scores];
  if (!shown) scores[other] = -1;
  else if (other === 1) scores[1] = g.series.declared;
  const s: Series = {
    ...g.series,
    totals: [...g.series.totals],
    ready: [...g.series.ready],
    history: g.series.history.map((h) => ({
      ...h,
      hands: [[...h.hands[0]], [...h.hands[1]]],
      awards: [...h.awards],
    })),
  };
  if (!shown && s.phase === 'reveal') {
    s.totals[other] -= other === 1 ? award(s.declared) : award(g.scores[0]);
    s.declared = -1;
  }
  return {
    kind: 'ochko',
    turn: g.turn,
    hands,
    scores,
    done: [...g.done],
    actionSeq: [...g.actionSeq],
    deadlines: [...g.deadlines],
    dealUntil: [...g.dealUntil],
    winner: g.winner,
    golden: shown
      ? [...g.golden]
      : pair(p === 0 ? g.golden[0] : false, p === 1 ? g.golden[1] : false),
    series: s,
  };
}
