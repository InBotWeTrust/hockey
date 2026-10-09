import { describe, it, expect } from 'vitest';
import { advanceFight, createFightState } from '../src/fight/engine.js';
import { DEFAULT_FIGHT_RULES as ONLINE_RULES } from '../src/fight/config.js';
import { getFightPosture } from '../src/fight/responsiveInput.js';
import { fightPositionsAt } from '../src/fight/movement.js';
import type { FightCommand, FightHeldInput } from '../src/fight/types.js';
const DEFAULT_FIGHT_RULES={...ONLINE_RULES,initialHp:4,windupMs:250};
const hold = (player: 0|1, t: number, seq: number, input: Partial<FightHeldInput>): FightCommand => ({player, phaseId:0, seq, effectiveAtMs:t, kind:'input', input:{direction:0,crouch:false,guard:false,...input}});
const attack = (player:0|1,t:number,seq:number): FightCommand => ({player, phaseId:0, seq,effectiveAtMs:t,kind:'attack',zone:'head'});
const run = (commands: FightCommand[], t=1000) => advanceFight(createFightState(DEFAULT_FIGHT_RULES,0),commands,t).state;
describe('responsive held input', () => {
 it('crouch dodges head and captures low attack despite release',()=>{
  expect(run([attack(0,0,1),hold(1,100,1,{crouch:true})]).hp).toEqual([4,4]);
  const s=run([hold(0,0,1,{crouch:true}),attack(0,10,2),hold(0,20,3,{})]);
  expect(s.actions[0]?.zone).toBe('body'); expect(s.hp).toEqual([4,3]);
  expect(getFightPosture(s,0,100).crouch).toBe(true); expect(getFightPosture(s,0,510).crouch).toBe(false);
 });
 it('lease expires at 750ms and renewals extend it',()=>{
  const s=run([hold(0,0,1,{guard:true}),hold(0,150,2,{guard:true})]);
  expect(getFightPosture(s,0,899).guard).toBe(true); expect(getFightPosture(s,0,900).guard).toBe(false);
 });
 it('shared guard breaks on third contact without HP damage and cannot immediately rearm',()=>{
  const cmds=[hold(1,0,1,{guard:true}),attack(0,0,1),hold(0,500,2,{direction:1}),hold(1,600,2,{guard:true}),attack(0,700,3),hold(0,1200,4,{direction:1}),hold(1,1200,3,{guard:true}),attack(0,1400,5)];
  const s=run(cmds,1650); expect(s.hp).toEqual([4,4]); expect(getFightPosture(s,1,1650).guardUnits).toBe(0);
  expect(getFightPosture(s,1,1800).guard).toBe(false);
 });
 it('regenerates only after release and the complete 600+500ms interval',()=>{
  const s=run([hold(1,0,1,{guard:true}),attack(0,0,1),hold(1,300,2,{})],1400);
  expect(getFightPosture(s,1,1399).guardUnits).toBe(2); expect(getFightPosture(s,1,1400).guardUnits).toBe(3);
 });
 it('does not reset endurance on stance change and blocks low attacks',()=>{
  const s=run([hold(0,0,1,{crouch:true}),attack(0,0,2),hold(1,0,1,{crouch:true,guard:true}),hold(1,300,2,{guard:true})]);
  expect(s.hp).toEqual([4,4]);expect(getFightPosture(s,1,400).guardUnits).toBe(2);
 });
 it('buffers only the latest press during final150ms and restores held guard',()=>{
  const s=run([attack(0,0,1),attack(0,200,2),hold(0,300,3,{guard:true}),attack(0,350,4),attack(0,400,5)],1100);
  expect(s.actions.map(a=>a.effectiveAtMs)).toEqual([0,500]);expect(s.actions[1]?.seq).toBe(5);
  expect(getFightPosture(s,0,1000).guard).toBe(true);
 });
 it('crouch is stationary and standing guard moves half speed',()=>{
  const a=run([hold(0,0,1,{direction:-1})],100);
  const b=run([hold(0,0,1,{direction:-1,guard:true})],100);
  const c=run([hold(0,0,1,{direction:-1,crouch:true})],100);
  expect(fightPositionsAt(a,100)[0]).toBeCloseTo(.29);expect(fightPositionsAt(b,100)[0]).toBeCloseTo(.305);expect(fightPositionsAt(c,100)[0]).toBe(.32);
 });
 it('single and subdivided advances produce identical state',()=>{
  const cmds=[hold(0,0,1,{guard:true}),attack(1,50,1),hold(0,500,2,{crouch:true})];
  const initial=createFightState(DEFAULT_FIGHT_RULES,0);
  const first=advanceFight(initial,cmds.slice(0,2),400).state;
  expect(advanceFight(first,cmds.slice(2),1200).state).toEqual(advanceFight(initial,cmds,1200).state);
 });
});
it('exhausted guard cannot block forever while held',()=>{
 const cmds:FightCommand[]=[];
 for(let i=0;i<4;i++) {if(i)cmds.push(hold(0,i*700-200,i*2,{direction:1}));cmds.push(hold(1,i*700,i+1,{guard:true}),attack(0,i*700,i*2+1));}
 const s=run(cmds,2350); expect(s.hp).toEqual([4,3]);
});
it('posture intent applies after an unsealed attack recovery without a new snapshot',()=>{
 const s=run([attack(0,0,1),hold(0,300,2,{crouch:true,guard:true})],300);
 expect(getFightPosture(s,0,499).guard).toBe(false);expect(getFightPosture(s,0,500).guard).toBe(true);expect(getFightPosture(s,0,500).crouch).toBe(true);
});

it.each([3,4])('preserves saved v3 and prevents rearming an exhausted guard in v4 (version %i)', version => {
  const commands: FightCommand[] = [];
  for (let index = 0; index < 4; index++) {
    if (index) commands.push(hold(0, index * 700 - 200, index * 2, {direction:1}));
    commands.push(attack(0, index * 700, index * 2 + 1));
    commands.push(hold(1, index < 3 ? index * 700 : index * 700 + 250, index + 1, {guard:true}));
  }
  const state = advanceFight(createFightState({...DEFAULT_FIGHT_RULES,version},0),commands,2350).state;
  expect(state.hp).toEqual(version>=4?[4,3]:[4,4]);
  expect(state.responsive!.contacts.at(-1)?.outcome).toBe(version>=4?'hit':'blocked');
});


it.each([0,1] as const)('live rules preserve low strike after crouch release for player %i', player => {
  const opponent = (1-player) as 0|1;
  const state = advanceFight(createFightState(ONLINE_RULES,0),[
    hold(player,0,1,{crouch:true}), attack(player,1,2), hold(player,2,3,{}),
  ],600).state;
  expect(state.actions).toHaveLength(1);
  expect(state.actions[0]?.zone).toBe('body');
  expect(state.hp[player]).toBe(5);
  expect(state.hp[opponent]).toBe(4);
});

it.each([0,1] as const)('live rules crouch and guard block a low strike for player %i', defender => {
  const attacker = (1-defender) as 0|1;
  const state = advanceFight(createFightState(ONLINE_RULES,0),[
    hold(defender,0,1,{crouch:true,guard:true}),
    hold(attacker,0,1,{crouch:true}), attack(attacker,1,2),
  ],200).state;
  expect(state.hp).toEqual([5,5]);
  expect(state.responsive!.contacts.at(-1)?.outcome).toBe('blocked');
  expect(getFightPosture(state,defender,200).guardUnits).toBe(2);
  expect(getFightPosture(state,defender,200).crouch).toBe(true);
});
