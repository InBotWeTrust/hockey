import { expect, it } from 'vitest';
import { createFightState, advanceFight } from '../src/fight/engine.js';
import { DEFAULT_FIGHT_RULES } from '../src/fight/config.js';
import { getFightPosture } from '../src/fight/responsiveInput.js';
it('preserves separate health and guard reserves through replay and regeneration', () => {
  const state = createFightState({...DEFAULT_FIGHT_RULES, initialHpByPlayer:[5,10], guardUnitsByPlayer:[3,5]}, 1000);
  expect(state.hp).toEqual([5,10]);
  const replay = advanceFight(state, [], 2000).state;
  expect(replay.hp).toEqual([5,10]);
  expect(getFightPosture(replay,0,2000).guardUnits).toBe(3);
  expect(getFightPosture(replay,1,2000).guardUnits).toBe(5);
  expect(getFightPosture(replay,1,5000).guardUnits).toBe(5);
});
it('keeps ordinary duels at equal reserves', () => {
  const state=advanceFight(createFightState(DEFAULT_FIGHT_RULES,1000),[],2000).state;
  expect(state.hp).toEqual([5,5]);
  expect(getFightPosture(state,1,2000).guardUnits).toBe(3);
});
it('uses remaining lives at the deadline in an asymmetric fight', () => {
  const state=createFightState({...DEFAULT_FIGHT_RULES, initialHpByPlayer:[5,10],guardUnitsByPlayer:[3,5]},1000);
  const result=advanceFight(state,[],21000).state;
  expect(result.winner).toBe(1);
  expect(result.status).toBe('resolved');
});
it('restores Oleg guard to five after blocking a hit and releasing guard',()=>{
 const rules={...DEFAULT_FIGHT_RULES,windupMs:250,initialHpByPlayer:[5,10] as [number,number],guardUnitsByPlayer:[3,5] as [number,number]};
 const initial=createFightState(rules,0);
 const blocked=advanceFight(initial,[
  {player:1,phaseId:0,seq:1,effectiveAtMs:0,kind:'input',input:{direction:0,crouch:false,guard:true}},
  {player:0,phaseId:0,seq:1,effectiveAtMs:0,kind:'attack',zone:'head'},
  {player:1,phaseId:0,seq:2,effectiveAtMs:300,kind:'input',input:{direction:0,crouch:false,guard:false}},
 ],1400).state;
 expect(blocked.hp).toEqual([5,10]);
 expect(getFightPosture(blocked,1,1399).guardUnits).toBe(4);
 expect(getFightPosture(blocked,1,1400).guardUnits).toBe(5);
});
