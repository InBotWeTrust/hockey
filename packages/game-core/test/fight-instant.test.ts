import { expect, it } from 'vitest';
import { advanceFight, createFightState } from '../src/fight/engine.js';
import { DEFAULT_FIGHT_RULES } from '../src/fight/config.js';
import { fightPositionsAt } from '../src/fight/movement.js';
import { getFightPosture } from '../src/fight/responsiveInput.js';
import type { FightCommand } from '../src/fight/types.js';
const attack: FightCommand = {kind:'attack',zone:'head',player:0,seq:1,phaseId:0,effectiveAtMs:10};
it('new fights hit at the press timestamp with a short recovery', () => {
  const state = advanceFight(createFightState(DEFAULT_FIGHT_RULES,0),[attack],10).state;
  expect(state.hp).toEqual([5,4]);
  expect(state.actions[0]).toMatchObject({activeAtMs:10,activeUntilMs:110,busyUntilMs:260});
  expect(fightPositionsAt(state,10)[1]).toBeCloseTo(.76);
});
it('zero startup spends one shield and applies one recoil only', () => {
  const rules={...DEFAULT_FIGHT_RULES,windupMs:0};
  const state = advanceFight(createFightState(rules,0),[
    {kind:'input',input:{direction:0,crouch:false,guard:true},player:1,seq:1,phaseId:0,effectiveAtMs:0}, attack,
  ],10).state;
  expect(state.hp).toEqual([5,5]);
  expect(getFightPosture(state,1,10).guardUnits).toBe(2);
  expect(fightPositionsAt(state,10)[0]).toBeCloseTo(.28);
  expect(state.responsive!.contacts).toHaveLength(1);
});
it('saved v4 fights keep their 80ms startup', () => {
  const initial=createFightState({...DEFAULT_FIGHT_RULES,version:4,windupMs:80},0);
  const waiting=advanceFight(initial,[attack],89).state;
  expect(waiting.hp).toEqual([5,5]);
  expect(advanceFight(waiting,[],90).state.hp).toEqual([5,4]);
});
it('simultaneous instant hits trade once and replay is deterministic', () => {
  const initial=createFightState(DEFAULT_FIGHT_RULES,0);
  const commands:FightCommand[]=[attack,{...attack,player:1}];
  const direct=advanceFight(initial,commands,400).state;
  const stepped=advanceFight(advanceFight(initial,commands,10).state,[],400).state;
  expect(direct.hp).toEqual([4,4]);
  expect(stepped).toEqual(direct);
});
