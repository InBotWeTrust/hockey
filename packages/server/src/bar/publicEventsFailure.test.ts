import type {Pool} from 'pg';
import {expect,it,vi} from 'vitest';
import {SqlConversationMemory} from './conversationMemory.js';
it('keeps chat memory usable when the public journal fails',async()=>{
 const query=vi.fn(async()=>({rows:[]}));
 const context=await new SqlConversationMemory({query} as unknown as Pool).context('user','maria','Кто играл?',[]);
 query.mockRejectedValueOnce(new Error('temporary_database_failure'));
 expect(await context.tool('public_bar_events',{playerName:'Егор',kind:'durak',character:'maria',days:1})).toMatchObject({unavailable:true});
 expect(context.facts).toEqual([]);
});
