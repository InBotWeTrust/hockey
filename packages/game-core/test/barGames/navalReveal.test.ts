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
it('lets Timofey escape with the surviving half only in new matches',()=>{
 for(const version of [16,18]) {
  const runtime=createMatch('battleship',1,0,true,4,version);
  const game=sea.start(runtime.game as unknown as sea.State);
  const sub=game.fleets[1].find(s=>s.kind==='submarine')!;
  sub.hits=[sea.cells(sub)[0]!];game.shots[0]=[{cell:sub.hits[0]!,hit:true}];
  runtime.game=game as unknown as sea.View;
  const updated=advance(runtime,runtime.animationUntil).game as unknown as sea.State;
  expect(updated.moves[1]).toBe(version===18?1:0);
  expect(updated.fleets[1].find(s=>s.kind==='submarine')!.w*updated.fleets[1].find(s=>s.kind==='submarine')!.h).toBe(version===18?1:2);
 }
});
