import { describe, expect, it } from 'vitest';
import type { Runtime } from '@hockey/game-core';
import { observeNonDurakTransition } from './achievementObservations.js';

const runtime = (game: Runtime['game']): Runtime => ({
  engineVersion: 25,
  game,
  deadline: 0,
  animationUntil: 0,
  missed: [0, 0],
  computer: false,
  seed: 1,
  reason: null,
  lastDart: null,
  poolFrames: [],
  animationStart: 0,
  revision: 1,
});

describe('non-Durak achievement observations', () => {
  it('tracks two consecutive 180 turns and a nine-dart 501 finish', () => {
    const turn = (score: number, winner: 0 | null = null) => ({
      ...runtime({
        kind: 'darts',
        turn: winner === null ? 1 : 0,
        winner,
        scores: [score, 501],
        dartsLeft: 3,
        hits: [],
        lastScore: 60,
      }),
      dartHits: [],
      feedback: { type: 'dart' as const, actor: 0 as const, points: 60, bust: false },
    });
    const start = runtime({
      kind: 'darts',
      turn: 0,
      winner: null,
      scores: [501, 501],
      dartsLeft: 1,
      hits: [],
      lastScore: 60,
    });
    const seeded = observeNonDurakTransition(start, start, undefined).telemetry;
    seeded.dartsThrown = [2, 0];
    seeded.dartsTurnPoints = [120, 0];
    const first = observeNonDurakTransition(start, turn(321), seeded);
    const secondBefore = runtime({
      kind: 'darts',
      turn: 0,
      winner: null,
      scores: [321, 501],
      dartsLeft: 1,
      hits: [],
      lastScore: 60,
    });
    first.telemetry.dartsThrown = [5, 0];
    first.telemetry.dartsTurnPoints = [120, 0];
    const second = observeNonDurakTransition(secondBefore, turn(141), first.telemetry);
    const finishBefore = runtime({
      kind: 'darts',
      turn: 0,
      winner: null,
      scores: [141, 501],
      dartsLeft: 1,
      hits: [],
      lastScore: 60,
    });
    second.telemetry.dartsThrown = [8, 0];
    const finish = observeNonDurakTransition(finishBefore, turn(0, 0), second.telemetry);
    expect(first.qualifiers[0]).toEqual({ 3: 1 });
    expect(second.qualifiers[0]).toEqual({ 3: 2 });
    expect(finish.qualifiers[0]).toMatchObject({ 4: 1 });
  });
  it('keeps a naval hit streak across trusted bot transitions and never credits a setup cancellation', () => {
    const base = runtime({
      kind: 'battleship',
      phase: 'battle',
      turn: 0,
      winner: null,
      ownShips: [],
      enemySunk: [],
      shots: [[], []],
      movesLeft: 0,
      canSalvo: false,
      lastAction: null,
    });
    const hit = (count: number) => ({
      ...runtime({
        ...base.game,
        shots: [[...Array.from({ length: count }, (_, cell) => ({ cell, hit: true }))], []],
        lastAction: { player: 0, type: 'attack', cells: [{ cell: count - 1, hit: true }] },
      } as Runtime['game']),
      feedback: { type: 'naval-attack' as const, actor: 0 as const, points: 1 },
    });
    const first = observeNonDurakTransition(base, hit(1), undefined);
    const second = observeNonDurakTransition(hit(1), hit(2), first.telemetry);
    const third = observeNonDurakTransition(hit(2), hit(3), second.telemetry);
    expect(first.qualifiers[0]).toEqual({ 34: 1 });
    expect(third.qualifiers[0]).toEqual({ 33: 1 });
    expect(third.telemetry.navalHitStreak[0]).toBe(3);
  });

  it('records a checker crown and only awards king and loss conditions on a real win', () => {
    const before = runtime({
      kind: 'checkers',
      board: [1, -2, -2, -1],
      turn: 0,
      winner: null,
      quiet: 0,
      white: 0,
      positions: {},
    });
    const crowned = {
      ...runtime({
        kind: 'checkers',
        board: [2, -2, -2, -1],
        turn: 1,
        winner: null,
        quiet: 0,
        white: 0,
        positions: {},
      }),
      feedback: { type: 'checkers' as const, actor: 0 as const, captured: 0 },
    };
    const end = runtime({ ...crowned.game, winner: 0 } as Runtime['game']);
    const one = observeNonDurakTransition(before, crowned, undefined);
    const result = observeNonDurakTransition(crowned, end, one.telemetry);
    expect(one.qualifiers[0]).toEqual({ 16: 1 });
    expect(result.qualifiers[0]).toMatchObject({ 17: 2, 18: 1 });
  });

  it('requires a legal played pool win after the player fouled', () => {
    const base = runtime({
      kind: 'billiards',
      turn: 0,
      winner: null,
      groups: ['solids', 'stripes'],
      break: false,
      ballInHand: false,
      lastFoul: false,
      balls: [
        { id: 0, x: 0, y: 0, pocketed: false },
        { id: 1, x: 0, y: 0, pocketed: true },
        { id: 9, x: 0, y: 0, pocketed: false },
        { id: 8, x: 0, y: 0, pocketed: false },
      ],
    });
    const before = {
      ...runtime({ ...base.game, lastFoul: true } as Runtime['game']),
      feedback: { type: 'shot' as const, actor: 0 as const, foul: true, pocketed: [] },
    };
    const poolGame =
      before.game.kind === 'billiards'
        ? before.game
        : (() => {
            throw new Error('expected pool');
          })();
    const after = runtime({
      ...poolGame,
      winner: 0,
      lastFoul: false,
      balls: poolGame.balls.map((ball) => (ball.id === 8 ? { ...ball, pocketed: true } : ball)),
    });
    const foul = observeNonDurakTransition(base, before, undefined);
    const result = observeNonDurakTransition(before, after, foul.telemetry);
    expect(result.qualifiers[0]).toMatchObject({ 8: 1, 10: 1, 11: 1 });
  });

  it.each([1, 2, 3, 4])(
    'counts %i own fouls in one winning match without replaying stale feedback',
    (count) => {
      let before = runtime({
        kind: 'billiards',
        turn: 0,
        winner: null,
        groups: ['solids', 'stripes'],
        break: false,
        ballInHand: false,
        lastFoul: false,
        balls: [
          { id: 1, x: 0, y: 0, pocketed: true },
          { id: 9, x: 0, y: 0, pocketed: false },
        ],
      });
      let telemetry: ReturnType<typeof observeNonDurakTransition>['telemetry'] | undefined;
      for (let i = 0; i < count; i++) {
        const after = {
          ...runtime({ ...before.game }),
          feedback: { type: 'shot' as const, actor: 0 as const, foul: true, pocketed: [] },
        };
        telemetry = observeNonDurakTransition(before, after, telemetry).telemetry;
        telemetry = observeNonDurakTransition(after, { ...after }, telemetry).telemetry;
        before = after;
      }
      const after = runtime({ ...before.game, winner: 0 });
      expect(observeNonDurakTransition(before, after, telemetry).qualifiers[0][11]).toBe(count);
      expect(
        observeNonDurakTransition(before, runtime({ ...before.game, winner: 1 }), telemetry)
          .qualifiers[1][11],
      ).toBeUndefined();
    },
  );

  it('maps exact pool margins through six and never awards an unlisted seven-ball margin', () => {
    for (const [margin, expected] of [
      [3, 1],
      [4, 2],
      [5, 3],
      [6, 4],
      [7, 0],
    ] as const) {
      const balls = [
        { id: 0, x: 0, y: 0, pocketed: false },
        { id: 8, x: 0, y: 0, pocketed: true },
      ];
      for (let id = 1; id <= margin; id++) balls.push({ id, x: 0, y: 0, pocketed: true });
      const before = runtime({
        kind: 'billiards',
        turn: 0,
        winner: null,
        groups: ['solids', 'stripes'],
        break: false,
        ballInHand: false,
        lastFoul: false,
        balls,
      });
      const after = runtime({ ...before.game, winner: 0 });
      expect(observeNonDurakTransition(before, after, undefined).qualifiers[0]?.[9] ?? 0).toBe(
        expected,
      );
    }
  });

  it('awards Ochko cheat catch, final-round comeback and exact final margin from engine state', () => {
    const ochko = (
      round: number,
      totals: [number, number],
      winner: 0 | 1 | null,
      challengeResult: 'correct' | null,
    ) =>
      runtime({
        kind: 'ochko',
        turn: 0,
        hands: [[], []],
        scores: [0, 0],
        done: [false, false],
        actionSeq: [0, 0],
        deadlines: [0, 0],
        dealUntil: [0, 0],
        winner,
        golden: [false, false],
        series: {
          round,
          totalRounds: 4,
          phase: winner === null ? 'play' : 'finished',
          totals,
          history: [],
          ready: [false, false],
          revealAt: 0,
          reviewAt: 0,
          reviewUntil: 0,
          nextAt: 0,
          declared: 0,
          challenged: challengeResult === 'correct',
          challengeResult,
          technical: false,
        },
      } as Runtime['game']);
    const transition = observeNonDurakTransition(
      ochko(3, [5, 15], null, null),
      ochko(4, [16, 15], 0, 'correct'),
      undefined,
    );
    expect(transition.qualifiers[0]).toMatchObject({ 22: 1, 23: 3, 24: 1 });
  });

  it('does not turn a technical winner into a pin achievement', () => {
    const before = runtime({
      kind: 'armwrestling',
      turn: 0,
      progress: 0.2,
      stamina: [1, 1],
      inputs: [
        { seq: 0, supportHeld: false, support: 0, pressing: false, wrist: 'straight' },
        { seq: 0, supportHeld: false, support: 0, pressing: false, wrist: 'straight' },
      ],
      lastSeq: [0, 0],
      expiry: [0, 0],
      releasedSince: [0, 0],
      warning: [false, false],
      startedAt: 0,
      endsAt: 1,
      simulatedAt: 0,
      observedAt: 0,
      seed: 1,
      winner: null,
      reason: null,
    });
    const after = runtime({ ...before.game, winner: 0, reason: 'time' } as Runtime['game']);
    expect(observeNonDurakTransition(before, after, undefined).qualifiers[0]).toEqual({});
  });
});
