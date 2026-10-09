import { it, expect } from 'vitest';
import { createFightState, advanceFight } from '../src/fight/engine.js';
import { DEFAULT_FIGHT_RULES } from '../src/fight/config.js';
import { fightPositionsAt } from '../src/fight/movement.js';
import type { FightCommand } from '../src/fight/types.js';
const hold=(player:0|1,t:number,seq:number,direction:-1|0|1,guard=false):FightCommand=>({kind:'input',player,effectiveAtMs:t,seq,phaseId:0,input:{direction,crouch:false,guard}});
const attack:FightCommand={kind:'attack',player:0,effectiveAtMs:0,seq:1,phaseId:0,zone:'head'};
it('hit moves the defender backwards and repeated advance does not repeat displacement',()=>{
 const s=advanceFight(createFightState(DEFAULT_FIGHT_RULES,0),[attack],400).state;
 expect(fightPositionsAt(s,400)[1]).toBeCloseTo(.76);
 expect(fightPositionsAt(advanceFight(s,[],500).state,500)[1]).toBeCloseTo(.76);
});
it('blocked hit moves only the attacker backwards',()=>{
 const s=advanceFight(createFightState(DEFAULT_FIGHT_RULES,0),[attack,hold(1,0,1,0,true)],400).state;
 expect(fightPositionsAt(s,400)).toEqual([.28,.68]);expect(s.hp).toEqual([5,5]);
});
it('expanded boundaries allow retreat without pushing a stationary opponent',()=>{
 const s=advanceFight(createFightState(DEFAULT_FIGHT_RULES,0),[hold(0,0,1,-1),hold(0,700,2,-1)],1000).state;
 expect(fightPositionsAt(s,1000)[0]).toBeCloseTo(.1);
 const close=advanceFight(createFightState(DEFAULT_FIGHT_RULES,0),[hold(0,0,1,1)],500).state;
 expect(fightPositionsAt(close,500)[1]).toBeCloseTo(.68);
 expect(fightPositionsAt(close,500)[0]).toBeCloseTo(.34);
 expect(fightPositionsAt(close,600)[1]).toBeCloseTo(.68);
});
it('knockback remains inside the arena at its edge',()=>{
 const commands:FightCommand[]=[hold(1,0,1,-1),hold(0,0,1,1),hold(0,500,2,0),hold(1,500,2,0),{...attack,effectiveAtMs:501,seq:3}];
 const s=advanceFight(createFightState(DEFAULT_FIGHT_RULES,0),commands,950).state;
 expect(fightPositionsAt(s,950)[1]).toBeCloseTo(.9);
 expect(s.responsive?.contacts[0]?.outcome).toBe('hit');
});
it('one attack against renewed held guard consumes exactly one shield',()=>{
 const commands:FightCommand[]=[];
 for(let i=0;i<10;i++)commands.push(hold(1,i*150,i+1,0,true));
 commands.push({...attack,effectiveAtMs:500});
 const s=advanceFight(createFightState(DEFAULT_FIGHT_RULES,0),commands,1500).state;
 expect(s.hp).toEqual([5,5]);expect(s.responsive?.contacts).toHaveLength(1);
 expect(s.responsive?.timeline.at(-1)?.players[1].guardUnits).toBe(2);
});
