import {expect,it,vi} from 'vitest';
import {requireElinaOffice,elinaIntervention} from './elinaOffice.js';
import {officeDayMode} from './officeSchedule.js';
const day=Array.from({length:30},(_,i)=>new Date(Date.UTC(2026,9,1+i)).toISOString().slice(0,10)).find(day=>officeDayMode('alice',day)==='seated')!;
it('requires a current seated visit and rejects missing, departed and warned office state',async()=>{
 const base={day,state_day:day,office_warnings:0,departed_at:null,warned_at:null,fight_id:null,visiting:true,presence_mode:"seated",presence_valid:true,absent:false};
 const query=vi.fn().mockResolvedValue({rows:[base]});
 const db={query} as unknown as Parameters<typeof requireElinaOffice>[0];
 expect(await requireElinaOffice(db,'alice')).toEqual({day,warnings:0});
 for(const change of [{state_day:'2020-01-01'},{departed_at:'now'},{warned_at:'now'},{fight_id:'fight'},{visiting:false},{presence_valid:false},{presence_mode:'empty'},{absent:true}]){
  query.mockResolvedValue({rows:[{...base,...change}]});
  await expect(requireElinaOffice(db,'alice')).rejects.toMatchObject({code:'elina_unavailable'});
 }
 query.mockResolvedValue({rows:[]});await expect(requireElinaOffice(db,'alice')).rejects.toMatchObject({code:'elina_unavailable'});
});
it('warns before ejecting and never offers a game or starts a fight',()=>{
 expect(elinaIntervention(0).intervention).toBe('office-warning');
 expect(elinaIntervention(1).intervention).toBe('office-eject');
});

it('requires a persisted presence instead of accepting the old daily coin flip',async()=>{
 const query=vi.fn().mockResolvedValue({rows:[{day,state_day:day,office_warnings:0,departed_at:null,warned_at:null,fight_id:null,visiting:true,presence_mode:'empty',presence_valid:true,absent:false}]});
 await expect(requireElinaOffice({query} as unknown as Parameters<typeof requireElinaOffice>[0],'alice')).rejects.toMatchObject({code:'elina_unavailable'});
});
