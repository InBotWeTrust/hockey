import { it, expect } from 'vitest';
import { advanceFight,createFightState } from '../src/fight/engine.js';
import { DEFAULT_FIGHT_RULES } from '../src/fight/config.js';
import type { FightCommand } from '../src/fight/types.js';
const attack=(player:0|1,t:number):FightCommand=>({player,seq:1,phaseId:0,kind:'attack',zone:'head',effectiveAtMs:t});
const run=(commands:FightCommand[],hp:[number,number]=[4,4])=>advanceFight({...createFightState(DEFAULT_FIGHT_RULES,0),hp},commands,1000);
it('earlier contact interrupts pending attack and never later awards its damage',()=>{
 const r=run([attack(0,0),attack(1,100)]);expect(r.state.hp).toEqual([4,3]);expect(r.state.actions[1]?.outcome).toBe('cancelled');
 expect(advanceFight(r.state,[],1500).state.hp).toEqual([4,3]);
});
it('equal-time hits trade independently of command order',()=>{
 const a=attack(0,0),b=attack(1,0);expect(run([a,b]).state.hp).toEqual([3,3]);expect(run([a,b]).state).toEqual(run([b,a]).state);
});
it('simultaneous lethal contacts enter sudden death once',()=>{
 const r=run([attack(0,0),attack(1,0)],[1,1]);expect(r.state.status).toBe('sudden_death');expect(r.events.filter(e=>e.type==='phase')).toHaveLength(1);
});
it('completed contacts are never undone or repeated',()=>{
 const r=run([attack(0,0),attack(1,300)]);expect(r.state.hp).toEqual([3,3]);expect(advanceFight(r.state,[],1500).events.filter(e=>e.type==='damage')).toHaveLength(0);
});
it('late defence cannot rewrite an already sealed contact at the same timestamp',()=>{
 const first=advanceFight(createFightState(DEFAULT_FIGHT_RULES,0),[attack(0,0)],250);
 const late:FightCommand={kind:'input',input:{direction:0,crouch:true,guard:true},player:1,seq:1,phaseId:0,effectiveAtMs:250};
 const next=advanceFight(first.state,[late],500);
 expect(next.state.hp).toEqual([4,3]);expect(next.events).toContainEqual({type:'rejected',player:1,seq:1,reason:'time'});
});
