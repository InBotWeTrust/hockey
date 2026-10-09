import { expect,it } from 'vitest';
import { createFightState,advanceFight,DEFAULT_FIGHT_RULES } from '@hockey/game-core';
import { FightMovementPresentation } from './fightMovementPresentation.js';
it('moves on the next frame while the server snapshot is delayed, then stops on release',()=>{
 const state=createFightState(DEFAULT_FIGHT_RULES,0);const p=new FightMovementPresentation();
 p.input(state,0,1000,{direction:1,crouch:false,guard:false},'held');
 expect(p.positions(state,0,1016,0)[0]).toBeGreaterThan(.32);
 p.input(state,0,1016,{direction:0,crouch:false,guard:false},'released');
 const stopped=p.positions(state,0,1016,0)[0];
 expect(p.positions(state,0,1066,0)[0]).toBe(stopped);
});
it('limits prediction at the opponent and preserves attack and crouch movement locks',()=>{
 const s=createFightState(DEFAULT_FIGHT_RULES,0),p=new FightMovementPresentation();
 p.input(s,0,1000,{direction:1,crouch:false,guard:false},'held');
 expect(p.positions(s,0,1100,1200)[0]).toBe(.32);
 expect(p.positions(s,0,1400,1200)[0]).toBeCloseTo(.34);
 p.input(s,0,1400,{direction:-1,crouch:true,guard:false},'crouch');
 expect(p.positions(s,0,1500,0)[0]).toBeCloseTo(.34);
});
it('mirrors forward movement for side one and resets prediction explicitly',()=>{
 const s=createFightState(DEFAULT_FIGHT_RULES,0),p=new FightMovementPresentation();
 p.input(s,1,1000,{direction:1,crouch:false,guard:false},'held');
 expect(p.positions(s,1,1016,0)[1]).toBeLessThan(.68);
 p.clear();expect(p.positions(s,1,1016,0)).toEqual([.32,.68]);
});

it('reconciles acknowledged movement gradually and keeps server damage separate',()=>{
 const s=createFightState(DEFAULT_FIGHT_RULES,0),p=new FightMovementPresentation();
 p.input(s,0,1000,{direction:-1,crouch:false,guard:false},'held');
 const before=p.positions(s,0,1050,0)[0];
 const next=advanceFight(s,[{kind:'input',player:0,phaseId:0,seq:1,effectiveAtMs:1040,input:{direction:-1,crouch:false,guard:false},actionId:'held'}],1050).state;
 const after=p.positions(next,0,1066,0)[0];
 expect(Math.abs(after-before)).toBeLessThan(.02);expect(next.hp).toEqual([5,5]);
});
it('does not predict skating forever without confirmation and resets at fight end',()=>{
 const s=createFightState(DEFAULT_FIGHT_RULES,0),p=new FightMovementPresentation();
 p.input(s,0,1000,{direction:-1,crouch:false,guard:false},'held');p.positions(s,0,1016,0);
 expect(p.positions(s,0,2500,0)[0]).toBeCloseTo(.32,1);
 s.status='resolved';expect(p.positions(s,0,2516,0)).toEqual([.32,.68]);
});

it('predicts the faster runtime movement while retaining saved legacy speed',()=>{
 for(const version of [5,6]){
  const state=createFightState({...DEFAULT_FIGHT_RULES,version},0),p=new FightMovementPresentation();
  p.input(state,0,1000,{direction:-1,crouch:false,guard:false},'held');
  expect(p.positions(state,0,1100,0)[0]).toBeCloseTo(.32-(version===6?.04:.03));
 }
});
