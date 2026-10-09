import { expect,it } from 'vitest';
import { advanceFight,createFightState,DEFAULT_FIGHT_RULES as ONLINE_RULES } from '@hockey/game-core';
import { fightNeedsAdvance } from '../../src/duel/amateur/fight/progression.js';
const DEFAULT_FIGHT_RULES={...ONLINE_RULES,windupMs:250};
it('progresses sealed contact at start of strike instead of waiting its active end',()=>{
 const s=advanceFight(createFightState(DEFAULT_FIGHT_RULES,0),[{kind:'attack',zone:'head',phaseId:0,seq:1,player:0,effectiveAtMs:0}],100).state;
 expect(fightNeedsAdvance(s,250)).toBe(true);
});
it('progresses buffered recovery and held leases even after the first contact resolved',()=>{
 const s=advanceFight(createFightState(DEFAULT_FIGHT_RULES,0),[{kind:'attack',zone:'head',phaseId:0,seq:1,player:0,effectiveAtMs:0},{kind:'attack',zone:'head',phaseId:0,seq:2,player:0,effectiveAtMs:400}],400).state;
 expect(s.actions[0]?.resolved).toBe(true);expect(fightNeedsAdvance(s,500)).toBe(true);
});
