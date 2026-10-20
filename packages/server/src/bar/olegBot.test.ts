import { fightPositionsAt, getFightPosture } from '@hockey/game-core';
import { expect, it } from 'vitest';
import { advanceOlegRuntime, createOlegRuntime } from './olegBot.js';
it('makes server-controlled decisions and restores the same fight after a restart', () => {
  const initial = createOlegRuntime(1000, 123);
  const a = advanceOlegRuntime(initial, 6000);
  expect(a.state.responsive?.commands.some((c) => c.player === 1)).toBe(true);
  const restored = JSON.parse(JSON.stringify(a));
  expect(advanceOlegRuntime(restored, 21000)).toEqual(advanceOlegRuntime(a, 21000));
  expect(initial.state.hp).toEqual([5, 10]);
});
it('different seeds produce different decisions, including pauses and posture changes', () => {
  const a = advanceOlegRuntime(createOlegRuntime(1000, 1), 6000);
  const b = advanceOlegRuntime(createOlegRuntime(1000, 2), 6000);
  expect(a.state.responsive?.commands).not.toEqual(b.state.responsive?.commands);
});
it('never rerolls a completed fight', () => {
  const ended = advanceOlegRuntime(createOlegRuntime(1000, 321), 40000);
  expect(['resolved', 'cancelled']).toContain(ended.state.status);
  expect(advanceOlegRuntime(ended, 50000)).toEqual(ended);
});
it('does not inspect or react to future player commands',()=>{
 const initial=createOlegRuntime(1000,42);
 const future={player:0 as const,phaseId:0,seq:1,effectiveAtMs:15000,kind:'input' as const,input:{direction:-1 as const,crouch:true,guard:true}};
 expect(advanceOlegRuntime(initial,6000,[future])).toEqual(advanceOlegRuntime(initial,6000));
});

it('leaves time to act at the start instead of landing an opening knockout',()=>{
 for(let seed=1;seed<=40;seed++){
  const state=advanceOlegRuntime(createOlegRuntime(1000,seed),2800).state;
  expect(state.hp[0],`seed ${seed}`).toBeGreaterThanOrEqual(3);
 }
});

it('resists blindly walking forward and repeating standing punches', () => {
 let wins = 0;
 for (let seed = 1; seed <= 12; seed++) {
  let runtime = createOlegRuntime(1000, seed);
  for (let at = 1050; at <= 32000 && !['resolved','cancelled'].includes(runtime.state.status); at += 150) {
   const base = { player: 0 as const, phaseId: runtime.state.phaseId, effectiveAtMs: at };
   const seq = runtime.state.lastSeq[0] + 1;
   runtime = advanceOlegRuntime(runtime, at, [
    {...base, seq, kind:'input', input:{direction:1,crouch:false,guard:false}},
    ...((at-1050)%300===0 ? [{...base, seq:seq+1, kind:'attack' as const, zone:'head' as const}] : []),
   ]);
  }
  wins += Number(runtime.state.winner === 0);
 }
 expect(wins).toBeLessThanOrEqual(8);
});

it('keeps the previous behavior for persisted fights without a behavior version', () => {
 const old = createOlegRuntime(1000, 1);
 delete old.behaviorVersion;
 old.nextAttackAt = 2800;
 const state = advanceOlegRuntime(old, 6000).state;
 expect(state.hp[0]).toBeGreaterThanOrEqual(3);
 expect(state.actions.filter(a => a.player === 1 && a.kind === 'attack').length).toBeLessThanOrEqual(2);
});

it('chooses body punches against a visible crouching opponent', () => {
 let runtime = createOlegRuntime(1000, 21);
 for (let at = 1001; at <= 3000; at += 150) {
  runtime = advanceOlegRuntime(runtime, at, [{player:0, phaseId:0,
   seq:runtime.state.lastSeq[0]+1,effectiveAtMs:at,kind:'input',
   input:{direction:0,crouch:true,guard:false}}]);
 }
 const punches = runtime.state.actions.filter(a => a.player === 1 && a.kind === 'attack');
 expect(punches.length).toBeGreaterThan(0);
 expect(punches.every(a => a.zone === 'body')).toBe(true);
});

it('does not instantly read a crouch submitted on its decision tick', () => {
 let runtime = createOlegRuntime(1000, 21);
 runtime = advanceOlegRuntime(runtime, 1899);
 runtime = advanceOlegRuntime(runtime, 1900, [{player:0,phaseId:0,seq:1,
  effectiveAtMs:1900,kind:'input',input:{direction:0,crouch:true,guard:false}}]);
 expect(runtime.state.actions.find(a => a.player === 1 && a.kind === 'attack')?.zone).toBe('head');
});

it('remains beatable by approaching in guard and changing attack level', () => {
 let wins = 0;
 for (let seed = 1; seed <= 12; seed++) {
  let runtime = createOlegRuntime(1000, seed);
  for (let at = 1050; at <= 32000 && !['resolved','cancelled'].includes(runtime.state.status); at += 50) {
   const observed = getFightPosture(runtime.state, 1, at - 180);
   const positions = fightPositionsAt(runtime.state, at - 1);
   const close = positions[1] - positions[0] <= 0.4;
   const base = {player:0 as const, phaseId:runtime.state.phaseId, effectiveAtMs:at};
   const seq = runtime.state.lastSeq[0] + 1;
   runtime = advanceOlegRuntime(runtime, at, [
    {...base,seq,kind:'input',input:{direction:1,crouch:close && !observed.crouch,guard:true}},
    ...(close && (at-1050)%300===0 ? [{...base,seq:seq+1,kind:'attack' as const,zone:'head' as const}] : []),
   ]);
  }
  wins += Number(runtime.state.winner === 0);
 }
 expect(wins).toBeGreaterThanOrEqual(6);
});

it('cannot attack before the shared countdown and entrance have finished',()=>{
 const runtime=createOlegRuntime(5000,42);
 const waiting=advanceOlegRuntime(runtime,4999);
 expect(waiting.state.actions).toHaveLength(0);
 expect(waiting.state.hp).toEqual([5,10]);
 expect(waiting.state.deadlineMs-waiting.state.phaseStartedAtMs).toBe(20000);
});
