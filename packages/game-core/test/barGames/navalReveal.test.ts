import { expect, it } from 'vitest';
import { barBattleship as sea, createMatch, command, publicRuntime, advance } from '../../src/index.js';
it.each(['surrender', 'timeout'] as const)('reveals the fleet after %s, never during play', reason => {
  const runtime = createMatch('battleship', 0, 0, false, 4);
  runtime.game = sea.start(runtime.game as unknown as sea.State) as unknown as sea.View;
  expect(publicRuntime(runtime, 0).game).not.toHaveProperty('enemyReveal');
  const final = reason === 'surrender' ? command(runtime, 0, { type: 'surrender' }, 1) : advance(runtime, 120001);
  expect(final.game.winner).not.toBeNull();
  for (const player of [0, 1] as const) {
    const view = publicRuntime(final, player).game as sea.View;
    expect(view.enemyReveal?.ships).toEqual((final.game as unknown as sea.State).fleets[1-player]);
    expect(view).not.toHaveProperty('submarineHistory');
  }
});
