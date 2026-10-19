import { expect, it } from 'vitest';
import { advanceFight, createFightState, DEFAULT_FIGHT_RULES } from '@hockey/game-core';
import { FightHitstop } from './fightHitstop.js';
const initial = () => createFightState({...DEFAULT_FIGHT_RULES, version:6}, 0);
const hit = () => advanceFight(initial(), [{player:0,phaseId:0,seq:1,kind:'attack',zone:'head',effectiveAtMs:1}], 1).state;
it('freezes visual time for 60ms once without changing authoritative state', () => {
 const s=initial(), h=new FightHitstop(s), next=hit();
 const copy=JSON.stringify(next);h.observe(next,100);
 expect(h.time(100)).toBe(100);expect(h.time(159)).toBe(100);
 h.observe(next,150);expect(h.time(160)).toBe(160);
 expect(JSON.stringify(next)).toBe(copy);
});
it('uses 35ms for block, 90ms for knockout, none for misses', () => {
 for(const [outcome,hp,duration] of [['blocked',5,35],['hit',0,90],['miss',5,0]] as const){
  const h=new FightHitstop(initial()),s=hit();s.responsive!.contacts[0]!.outcome=outcome;s.hp[1]=hp;
  h.observe(s,100);expect(h.time(100+Math.max(0,duration-1))).toBe(100);
  expect(h.time(100+duration)).toBe(100+duration);
 }
});
it('does not replay history on reconnect or extend repeated snapshots', () => {
 const s=hit(),h=new FightHitstop(s);h.observe(s,200);expect(h.time(220)).toBe(220);
});
it('releases the freeze on a new phase', () => {
 const h=new FightHitstop(initial()),s=hit();h.observe(s,100);
 h.observe({...s,phaseId:1},110);expect(h.time(111)).toBe(111);
});
