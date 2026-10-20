import {expect,it,vi} from 'vitest';
import {readElinaBehaviour} from './elinaBehaviour.js';
import {SqlConversationMemory} from './conversationMemory.js';
import type {Pool} from 'pg';
it('reads only the authenticated visitor activity without any private dialogues',async()=>{
 const query=vi.fn().mockResolvedValue({rows:[]});
 const result=await readElinaBehaviour({query} as unknown as Parameters<typeof readElinaBehaviour>[0],'owner');
 expect(query).toHaveBeenCalledTimes(3);
 for(const [sql,params] of query.mock.calls){expect(params).toEqual(['owner']);expect(sql).not.toContain('bar_conversations');}
 expect(result).toMatchObject({games:[],cards:[],fights:[]});
});
it('does not let Elina look up other visitors through public events',async()=>{
 const query=vi.fn().mockResolvedValue({rows:[]});
 const context=await new SqlConversationMemory({query} as unknown as Pool).context('owner','elina','Что было с Егором?',[]);
 query.mockClear();
 const result=await context.tool!('public_bar_events',{playerName:'Егор',kind:'fight',character:'oleg',days:1});
 expect(result).toEqual({unavailable:true});
 expect(query).not.toHaveBeenCalled();
});
