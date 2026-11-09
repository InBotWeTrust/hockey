import { expect, it } from 'vitest';
import { ENGINE_VERSION, advance, barBattleship as sea, command, createMatch, publicRuntime } from '../../src/barGames/runtime.js';

function rescueTurn(player: 0 | 1, version = ENGINE_VERSION, computer = false) {
  const opponent = player === 0 ? 1 : 0;
  let runtime = createMatch('battleship', opponent, 0, computer, 4, version);
  const game = sea.start(runtime.game as unknown as sea.State);
  const submarine = game.fleets[player].find(ship => ship.kind === 'submarine')!;
  runtime.game = game as unknown as sea.View;
  runtime.animationUntil = 0;
  runtime = command(runtime, opponent, {
    type: 'naval-attack', x: submarine.x, y: submarine.y, salvo: false, vertical: false,
  }, 1);
  const water = Array.from({ length: 144 }, (_, cell) => cell)
    .find(cell => !game.fleets[player].some(ship => sea.cells(ship).includes(cell)))!;
  runtime = command(runtime, opponent, {
    type: 'naval-attack', x: water % 12, y: Math.floor(water / 12), salvo: false, vertical: false,
  }, runtime.animationUntil + 1);
  return runtime;
}

it.each([0, 1] as const)('keeps player %i shot and deadline after a private rescue', player => {
  const runtime = rescueTurn(player);
  const before = structuredClone(runtime);
  const destination = sea.moves(publicRuntime(runtime, player).game as sea.View)[0]!;
  const now = runtime.animationUntil + 1000;
  const moved = command(runtime, player, { type: 'naval-move', ...destination }, now);
  expect(moved.game.turn).toBe(player);
  expect(moved.deadline).toBe(runtime.deadline);
  expect(publicRuntime(moved, player).game.lastAction?.type).toBe('move');
  const opponent = player === 0 ? 1 : 0;
  expect(publicRuntime(moved, opponent).game.lastAction).toBeNull();
  expect(publicRuntime(moved, opponent).feedback).toBeUndefined();
  expect(publicRuntime(advance(moved, moved.deadline), opponent).feedback?.type).toBe('timeout');
  expect(sea.moves(publicRuntime(moved, player).game as sea.View)).toEqual([]);
  expect(() => command(moved, player, { type: 'naval-move', ...destination }, now)).toThrow();
  expect(() => command(moved, opponent, {
    type: 'naval-attack', x: 0, y: 0, salvo: false, vertical: false,
  }, now)).toThrow();
  const fired = command(moved, player, {
    type: 'naval-attack', x: 0, y: 0, salvo: false, vertical: false,
  }, moved.animationUntil);
  expect(publicRuntime(fired, opponent).feedback?.type).toBe('naval-attack');
  expect(runtime).toEqual(before);
});

it('preserves the visible turn-consuming rescue in engine 21', () => {
  const runtime = rescueTurn(0, 21);
  const destination = sea.moves(publicRuntime(runtime, 0).game as sea.View)[0]!;
  const moved = command(runtime, 0, { type: 'naval-move', ...destination }, runtime.animationUntil);
  expect(moved.game.turn).toBe(1);
  expect(publicRuntime(moved, 1).game.lastAction?.type).toBe('move');
  expect(publicRuntime(moved, 1).feedback?.type).toBe('naval-move');
});

it('lets Timofey rescue and then shoot without passing the turn between actions', () => {
  const runtime = rescueTurn(1, ENGINE_VERSION, true);
  const moved = advance(runtime, runtime.animationUntil);
  expect((moved.game as unknown as sea.State).moves[1]).toBe(1);
  expect(moved.game.turn).toBe(1);
  expect(publicRuntime(moved, 0).feedback).toBeUndefined();
  const fired = advance(moved, moved.animationUntil);
  expect((fired.game as unknown as sea.State).shots[1].length).toBeGreaterThan(0);
  expect(publicRuntime(fired, 0).feedback?.type).toBe('naval-attack');
});

it.each([0, 1] as const)('keeps player %i submarine damage private until the remaining section sinks', player => {
  const runtime = rescueTurn(player);
  const opponent = player === 0 ? 1 : 0;
  const destination = sea.moves(publicRuntime(runtime, player).game as sea.View)[0]!;
  const moved = command(runtime, player, { type: 'naval-move', x: destination.x, y: destination.y }, runtime.animationUntil + 1);
  const enemy = publicRuntime(moved, opponent).game as sea.View;
  expect(enemy.enemyWrecks).toEqual([]);
  expect(enemy.enemyMovesLeft).toBeUndefined();
  const own = publicRuntime(moved, player).game as sea.View;
  expect(own.ownShips.find(ship => ship.kind === 'submarine')?.wreck).toBeDefined();
  const state = moved.game as unknown as sea.State;
  const submarine = state.fleets[player].find(ship => ship.kind === 'submarine')!;
  submarine.hits = sea.cells(submarine);
  const revealed = publicRuntime(moved, opponent).game as sea.View;
  expect(revealed.enemyWrecks).toEqual([submarine.wreck]);
  expect(revealed.enemySunk.find(ship => ship.id === submarine.id)).toBeDefined();
});
