import type {Pool} from 'pg';
import {expect,it,vi} from 'vitest';
import {SqlPublicBarEvents} from './publicEvents.js';
it('projects only public fight facts and explains the winner relative to the player',async()=>{
 const query=vi.fn().mockResolvedValue({rows:[{id:'fight',display_name:'Егор',kind:'fight',character_id:'oleg',outcome:'loss',ended_at:new Date('2026-10-12T10:00:00Z'),conflict_started:true,runtime:{secret:'hidden'},user_id:'private-user',assistant:'private conversation'}]});
 const result=await new SqlPublicBarEvents({query} as unknown as Pool).find({playerName:'',kind:'fight',character:'oleg',days:7});
 expect(result.events).toEqual([{eventId:'fight',playerName:'Егор',kind:'fight',character:'oleg',provenance:'server',winner:'oleg',endedAt:'2026-10-12T10:00:00.000Z'}]);
 expect(JSON.stringify(result)).not.toContain('private');
 expect(result.events[0]).not.toHaveProperty('origin');
 expect(query.mock.calls[0]![0]).not.toMatch(/bar_conversations|runtime|assistant|user_message/i);
});
it('does not pick a player when public names collide',async()=>{
 const query=vi.fn().mockResolvedValue({rows:[{id:'one',display_name:'Егор'},{id:'two',display_name:'Егор'}]});
 const result=await new SqlPublicBarEvents({query} as unknown as Pool).find({playerName:'Егор',kind:'fight',character:'oleg',days:7});
 expect(result).toMatchObject({ambiguous:true,events:[]});
 expect(query).toHaveBeenCalledTimes(1);
});
it('uses literal player names, bounds results and excludes cancelled fights',async()=>{
 const query=vi.fn().mockResolvedValueOnce({rows:[{id:'player',display_name:'Егор'}]}).mockResolvedValueOnce({rows:[]});
 await new SqlPublicBarEvents({query} as unknown as Pool).find({playerName:'Егор',kind:'fight',character:'oleg',days:7});
 expect(query.mock.calls[0]![1]).toEqual(['Егор']);
 expect(query.mock.calls[1]![0]).toContain("status='resolved'");
 expect(query.mock.calls[1]![0]).toContain('limit 6');
});
it('bounds a burst of mixed events and returns only game fields, never private extras',async()=>{
 const rows=Array.from({length:100},(_,i)=>({id:String(i),display_name:'Посетитель',kind:'durak',character_id:'maria',outcome:i%2?'win':'loss',ended_at:new Date(Date.now()-i*1000),surrendered:false,caught_cheats:0,email:'private@example.test',runtime:{private:true}}));
 const query=vi.fn().mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows});
 const result=await new SqlPublicBarEvents({query} as unknown as Pool).find({playerName:'',kind:'any',character:'any',days:1});
 expect(result.events).toHaveLength(5);expect(result.hasMore).toBe(true);
 expect(result.events[0]).toMatchObject({kind:'durak',provenance:'client',winner:'maria'});
 expect(JSON.stringify(result)).not.toContain('private');
});
it('rejects unknown filters and excessive periods before reading the DB',async()=>{
 const query=vi.fn();
 await expect(new SqlPublicBarEvents({query} as unknown as Pool).find({playerName:'',kind:'any',character:'any',days:999})).rejects.toThrow();
 expect(query).not.toHaveBeenCalled();
});
it('retains millisecond chronology during a burst and attributes caught cheating to the character',async()=>{
 const base={display_name:'Егор',kind:'durak',character_id:'grigory',outcome:'win',surrendered:false,caught_cheats:1};
 const query=vi.fn().mockResolvedValue({rows:[{...base,id:'z',ended_at:new Date('2026-10-12T10:00:00.120Z')},{...base,id:'a',ended_at:new Date('2026-10-12T10:00:00.130Z')}]});
 const result=await new SqlPublicBarEvents({query} as unknown as Pool).find({playerName:'',kind:'durak',character:'grigory',days:1});
 expect(result.events[0]).toMatchObject({eventId:'a',caughtCharacterCheats:1,winner:'player'});
});
