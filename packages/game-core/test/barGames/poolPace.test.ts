import { expect, it } from 'vitest';
import * as pool from '../../src/barGames/pool.js';
import { command, createMatch } from '../../src/barGames/runtime.js';
const clearTable = (): pool.Game => ({ ...pool.create(0), break: false,
  balls: [{ id: 0, x: 0.5, y: 1.6, pocketed: false }] });
it('moves a strong shot promptly without making a gentle shot hard to control', () => {
 const strong = pool.shoot(clearTable(), {angle:-Math.PI/2,power:0.8});
 // At 0.2 seconds a strong shot should cover over half the table width.
 expect(1.6 - strong.frames[12]![0]!.y).toBeGreaterThan(0.5);
 const gentle = pool.shoot(clearTable(), {angle:-Math.PI/2,power:0.1});
 expect(1.6 - gentle.game.balls[0]!.y).toBeGreaterThan(0.1);
 expect(1.6 - gentle.game.balls[0]!.y).toBeLessThan(0.16);
 expect(gentle.durationMs).toBeLessThan(1000);
 expect(strong).toEqual(pool.shoot(clearTable(), {angle:-Math.PI/2,power:0.8}));
});
it('preserves the physics of ongoing version-five matches', () => {
 const base = createMatch('billiards',0,0,false,1);
 const old = {...base,engineVersion:5,game:clearTable()};
 const current = {...base,game:clearTable()};
 const shot = {type:'shot' as const,angle:-Math.PI/2,power:0.8};
 const prior = command(old,0,shot,100);
 const next = command(current,0,shot,100);
 expect(1.6-prior.poolFrames[12]![0]!.y).toBeCloseTo(0.413125,5);
 expect(1.6-next.poolFrames[12]![0]!.y).toBeGreaterThan(0.5);
 expect(prior.engineVersion).toBe(5);
});
