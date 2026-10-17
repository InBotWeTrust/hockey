import { expect, it } from 'vitest';
import {
  advance,
  command,
  createMatch,
  publicRuntime,
  barBattleship,
  barOchkoSeries,
} from '../../src/barGames/runtime.js';
it('passes the first naval timeout and loses on the second consecutive timeout', () => {
  let m = createMatch('battleship', 0, 0, false, 4);
  m.game = barBattleship.start(
    m.game as unknown as barBattleship.State,
  ) as unknown as typeof m.game;
  m = advance(m, 30000);
  expect(m.game.turn).toBe(1);
  expect(m.missed).toEqual([1, 0]);
  m = advance(m, 60000);
  m = advance(m, 90000);
  expect(m.game.winner).toBe(1);
  expect(m.reason).toBe('inactivity');
});
it('schedules the series bot before the hand timeout and keeps persisted review deadlines on reconnect', () => {
  const m = createMatch('ochko', 0, 0, true, 7);
  expect(m.deadline).toBeLessThan(40000);
  const g = advance(m, 100000);
  expect(g.game.kind).toBe('ochko');
  if (g.game.kind !== 'ochko') return;
  expect(g.game.series?.phase).toBe('review');
  const until = g.game.series!.reviewUntil;
  expect(until).toBeLessThan(230000);
  expect((advance(g, 110000).game as barOchkoSeries.State).series.reviewUntil).toBe(until);
  expect(JSON.stringify(publicRuntime(g, 0, 100000))).not.toMatch(
    /cheatBudget|cheatSeed|actualAward|stoppedAt|"deck"/,
  );
});
it('retains old one-round ochko and its command protocol in engine eleven', () => {
  let m = createMatch('ochko', 0, 0, false, 1, 11);
  expect(m.game.kind === 'ochko' && m.game.series).toBeUndefined();
  if (m.game.kind !== 'ochko') return;
  m = command(m, 0, { type: 'ochko-stand', seq: 1 }, 700);
  m = command(m, 1, { type: 'ochko-stand', seq: 1 }, 700);
  expect(m.game.winner).not.toBeNull();
});
it('replaces a stale timeout notice with the current naval attack', () => {
  let m = createMatch('battleship', 0, 0, false, 4);
  m.game = barBattleship.start(
    m.game as unknown as barBattleship.State,
  ) as unknown as typeof m.game;
  m.feedback = { type: 'timeout', actor: 0 };
  m.missed = [1, 0];
  m = command(m, 0, { type: 'naval-attack', x: 0, y: 0, salvo: false, vertical: false }, 0);
  expect(m.missed).toEqual([0, 0]);
  expect(m.feedback?.type).toBe('naval-attack');
});
it.each([12,13])('preserves version %i naval turn rules',version=>{
 let m=createMatch('battleship',0,1000,false,4,version);
 const g=barBattleship.start(m.game as unknown as barBattleship.State),s=g.fleets[1][0]!;
 m={...m,game:g as unknown as typeof m.game};
 const n=command(m,0,{type:'naval-attack',x:s.x,y:s.y,salvo:false,vertical:false},1000);
 expect(n.game.turn).toBe(version>=13?0:1);
});
it('gives new naval games thirty seconds while retaining old deadlines',()=>{
 expect(createMatch('battleship',0,1000,false,4).deadline).toBe(31000);
 expect(createMatch('battleship',0,1000,false,4,13).deadline).toBe(41000);
 expect(createMatch('checkers',0,1000,false,4).deadline).toBe(41000);
});
it('resets thirty seconds after a hit and grants thirty seconds after a skipped turn',()=>{
 let m=createMatch('battleship',0,0,false,4);
 const g=barBattleship.start(m.game as unknown as barBattleship.State),s=g.fleets[1][0]!;
 m={...m,game:g as unknown as typeof m.game};
 m=command(m,0,{type:'naval-attack',x:s.x,y:s.y,salvo:false,vertical:false},5000);
 expect(m.deadline).toBe(35000);expect(m.game.turn).toBe(0);
 m=advance(m,35000);expect(m.game.turn).toBe(1);expect(m.deadline).toBe(65000);
});
