import { expect, it, vi } from 'vitest';
import { createFightState, DEFAULT_FIGHT_RULES } from '@hockey/game-core';
import { fightActionSchema, admitFightCommand } from '../../src/duel/amateur/fight/commands.js';
import type { PoolClient } from 'pg';
vi.mock('../../src/duel/amateur/fight/service.js',()=>({
 getFight:vi.fn(),denyFight:(reason:string)=>{throw Error(reason)},queueFightSnapshot:vi.fn(),
}));
import { getFight } from '../../src/duel/amateur/fight/service.js';
const base={type:'fight:action',fightId:'00000000-0000-4000-8000-000000000001',actionId:'00000000-0000-4000-8000-000000000002',phaseId:0,seq:1};
it('strictly accepts versioned held input and rejects arbitrary timestamps',()=>{
 const payload={...base,kind:'input',input:{direction:0,crouch:true,guard:true}};
 expect(fightActionSchema.safeParse(payload).success).toBe(true);
 expect(fightActionSchema.safeParse({...payload,effectiveAtMs:0}).success).toBe(false);
});
it('admits held input through real schema and engine using bounded server time',async()=>{
 const state=createFightState(DEFAULT_FIGHT_RULES,1000);
 vi.mocked(getFight).mockResolvedValue({id:base.fightId,status:'fighting',engine_state:state,rules:state.rules,compensation_ms:[50,50]} as never);
 const query=vi.fn().mockResolvedValue({rows:[]});
 const body=fightActionSchema.parse({...base,kind:'input',input:{direction:-1,crouch:false,guard:true}});
 const ctx={id:'match',source:'invitation',status:'active',endsAtMs:100000,paused:true,nowMs:1200,canExtend:true,participants:[{userId:'a'},{userId:'b'}]} as never;
 expect(await admitFightCommand({query} as unknown as PoolClient,ctx,'a',body)).toMatchObject({accepted:true,seq:1});
 const insert=query.mock.calls.find(c=>String(c[0]).startsWith('insert into amateur_duel_fight_command'))!;
 expect(JSON.parse(insert[1][7])).toMatchObject({effectiveAtMs:1150,kind:'input',input:{direction:-1}});
 const update=query.mock.calls.find(c=>String(c[0]).startsWith('update amateur_duel_fight set'))!;
 expect(JSON.parse(update[1][1]).responsive.commands).toHaveLength(1);
});
