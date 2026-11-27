import type { Runtime } from '@hockey/game-core';

export type NonDurakTelemetry = {
  darts180Streak: [number, number];
  dartsThrown: [number, number];
  dartsTurnPoints: [number, number];
  poolFouls: [number, number];
  checkerOpponentKings: [number, number];
  checkerStartPieces: [number, number];
  ochkoFinalDeficit: [number, number];
  navalHitStreak: [number, number];
  navalShots: [number, number];
};

export type NonDurakObservation = {
  telemetry: NonDurakTelemetry;
  qualifiers: [Record<number, number>, Record<number, number>];
};

const fresh = (): NonDurakTelemetry => ({
  darts180Streak: [0, 0],
  dartsThrown: [0, 0],
  dartsTurnPoints: [0, 0],
  poolFouls: [0, 0],
  checkerOpponentKings: [0, 0],
  checkerStartPieces: [0, 0],
  ochkoFinalDeficit: [0, 0],
  navalHitStreak: [0, 0],
  navalShots: [0, 0],
});
const copy = (value?: NonDurakTelemetry): NonDurakTelemetry =>
  value
    ? {
        darts180Streak: [...value.darts180Streak] as [number, number],
        dartsThrown: [...value.dartsThrown] as [number, number],
        dartsTurnPoints: [...(value.dartsTurnPoints ?? [0, 0])] as [number, number],
        poolFouls: [...(value.poolFouls ?? [0, 0])] as [number, number],
        checkerOpponentKings: [...value.checkerOpponentKings] as [number, number],
        checkerStartPieces: [...value.checkerStartPieces] as [number, number],
        ochkoFinalDeficit: [...value.ochkoFinalDeficit] as [number, number],
        navalHitStreak: [...value.navalHitStreak] as [number, number],
        navalShots: [...value.navalShots] as [number, number],
      }
    : fresh();
const levels = (value: number, bounds: number[]) =>
  bounds.reduce((level, bound, index) => (value >= bound ? index + 1 : level), 0);
const add = (target: Record<number, number>, achievement: number, level: number) => {
  if (level) target[achievement] = Math.max(target[achievement] ?? 0, level);
};
const playerForPiece = (piece: number) => (piece > 0 ? 0 : 1);
const pieces = (board: number[], player: 0 | 1) =>
  board.filter((piece) => piece && playerForPiece(piece) === player);
const kings = (board: number[], player: 0 | 1) =>
  pieces(board, player).filter((piece) => Math.abs(piece) === 2).length;

/**
 * Extracts only facts produced by game-core transitions.  The returned telemetry is
 * persisted with the match, so bot/tick transitions cannot skip achievement state.
 */
export function observeNonDurakTransition(
  before: Runtime,
  after: Runtime,
  stored?: NonDurakTelemetry,
): NonDurakObservation {
  const telemetry = copy(stored),
    qualifiers: NonDurakObservation['qualifiers'] = [{}, {}];
  if (after.game === before.game) return { telemetry, qualifiers };
  const game = after.game;
  if (game.kind === 'darts' && before.game.kind === 'darts' && after.feedback?.type === 'dart') {
    const player = after.feedback.actor;
    telemetry.dartsThrown[player]++;
    telemetry.dartsTurnPoints[player] = after.feedback.bust
      ? 0
      : telemetry.dartsTurnPoints[player] + (after.feedback.points ?? 0);
    const turnEnded = game.winner !== null || game.turn !== player;
    if (turnEnded) {
      const is180 = telemetry.dartsTurnPoints[player] === 180;
      telemetry.darts180Streak[player] = is180 ? telemetry.darts180Streak[player] + 1 : 0;
      add(qualifiers[player], 3, telemetry.darts180Streak[player] >= 2 ? 2 : is180 ? 1 : 0);
      telemetry.dartsTurnPoints[player] = 0;
    }
    if (game.winner === player && telemetry.dartsThrown[player] === 9)
      add(qualifiers[player], 4, 1);
  }
  if (game.kind === 'billiards' && before.game.kind === 'billiards') {
    if (after.feedback?.type === 'shot' && after.feedback.foul)
      telemetry.poolFouls[after.feedback.actor]++;
    if (game.winner === 0 || game.winner === 1) {
      const winner = game.winner,
        own = game.groups[winner],
        opponent = game.groups[1 - winner];
      if (own && opponent) {
        const count = (group: typeof own) =>
          game.balls.filter(
            (ball) =>
              ball.id > 0 &&
              ball.id !== 8 &&
              ball.pocketed &&
              (ball.id < 8 ? 'solids' : 'stripes') === group,
          ).length;
        const mine = count(own),
          theirs = count(opponent),
          margin = mine - theirs;
        add(qualifiers[winner], 8, margin === 1 ? 1 : 0);
        add(qualifiers[winner], 9, [3, 4, 5, 6].indexOf(margin) + 1);
        add(qualifiers[winner], 10, theirs === 0 ? 1 : 0);
        add(qualifiers[winner], 11, levels(telemetry.poolFouls[winner], [1, 2, 3, 4]));
      }
    }
  }
  if (game.kind === 'checkers' && before.game.kind === 'checkers') {
    for (const player of [0, 1] as const) {
      telemetry.checkerStartPieces[player] ||= pieces(before.game.board, player).length;
      const other = player === 0 ? 1 : 0;
      telemetry.checkerOpponentKings[player] = Math.max(
        telemetry.checkerOpponentKings[player],
        kings(before.game.board, other),
        kings(game.board, other),
      );
    }
    if (after.feedback?.type === 'checkers') {
      const player = after.feedback.actor;
      add(qualifiers[player], 15, levels(after.feedback.captured ?? 0, [2, 3, 4]));
      const crowned =
        pieces(game.board, player).filter((piece) => Math.abs(piece) === 2).length >
        pieces(before.game.board, player).filter((piece) => Math.abs(piece) === 2).length;
      add(qualifiers[player], 16, crowned ? 1 : 0);
    }
    if (game.winner === 0 || game.winner === 1) {
      const winner = game.winner;
      add(qualifiers[winner], 17, levels(telemetry.checkerOpponentKings[winner], [1, 2]));
      const lost = telemetry.checkerStartPieces[winner] - pieces(game.board, winner).length;
      add(qualifiers[winner], 18, lost <= 6 ? 1 : 0);
    }
  }
  if (
    game.kind === 'ochko' &&
    before.game.kind === 'ochko' &&
    'series' in game &&
    'series' in before.game
  ) {
    const totalRounds = game.series.totalRounds ?? 4;
    if (before.game.series.round < totalRounds && game.series.round === totalRounds) {
      for (const player of [0, 1] as const) {
        const other = player === 0 ? 1 : 0;
        telemetry.ochkoFinalDeficit[player] = Math.max(
          telemetry.ochkoFinalDeficit[player],
          before.game.series.totals[other] - before.game.series.totals[player],
        );
      }
    }
    if (game.series.challengeResult === 'correct') add(qualifiers[0], 22, 1);
    if (game.winner === 0 || game.winner === 1) {
      const winner = game.winner;
      add(qualifiers[winner], 23, levels(telemetry.ochkoFinalDeficit[winner], [1, 5, 10]));
      add(
        qualifiers[winner],
        24,
        Math.abs(game.series.totals[0] - game.series.totals[1]) === 1 ? 1 : 0,
      );
    }
  }
  if (
    game.kind === 'armwrestling' &&
    before.game.kind === 'armwrestling' &&
    (game.winner === 0 || game.winner === 1)
  )
    add(qualifiers[game.winner], 28, game.reason === 'pin' ? 1 : 0);
  if (game.kind === 'battleship' && before.game.kind === 'battleship') {
    const privateGame = game as unknown as {
      fleets: Array<Array<{ kind: string; hits: number[]; w: number; h: number }>>;
      shots: Array<Array<{ cell: number; hit: boolean }>>;
      lastAction: {
        player: 0 | 1;
        type: 'attack' | 'move';
        cells: Array<{ cell: number; hit: boolean }>;
      } | null;
      winner: 0 | 1 | 'draw' | null;
    };
    const privateBefore = before.game as unknown as typeof privateGame;
    if (privateGame.lastAction?.type !== 'attack') return { telemetry, qualifiers };
    const player = privateGame.lastAction.player;
    const old = new Set(privateBefore.shots[player]!.map((mark) => mark.cell));
    const cells = privateGame.lastAction.cells.filter((mark) => !old.has(mark.cell));
    if (!cells.length) return { telemetry, qualifiers };
    const hits = cells.filter((cell) => cell.hit).length;
    const firstShot = telemetry.navalShots[player] === 0;
    telemetry.navalShots[player]++;
    for (const cell of cells) {
      telemetry.navalHitStreak[player] = cell.hit ? telemetry.navalHitStreak[player] + 1 : 0;
      add(qualifiers[player], 33, levels(telemetry.navalHitStreak[player], [3, 5, 10]));
    }
    add(qualifiers[player], 34, firstShot && hits > 0 ? 1 : 0);
    if (privateGame.winner === player) {
      const submarine = privateGame.fleets[player]!.find((ship) => ship.kind === 'submarine');
      const afloat = submarine !== undefined && submarine.hits.length < submarine.w * submarine.h;
      add(qualifiers[player], 32, afloat ? 1 : 0);
    }
  }
  return { telemetry, qualifiers };
}
