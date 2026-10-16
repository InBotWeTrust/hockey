import {expect,it} from 'vitest';
import {cardActivityCount, gameActivityCounts} from './barActivity.js';
it('counts incoming invitations and matched waiting rooms without double counting a match',()=>{
 const invites=[{receiver_id:'me',status:'pending',expires_at:'2099-01-01',id:'a'},{receiver_id:'other',status:'pending',expires_at:'2099-01-01',id:'b'}];
 expect(cardActivityCount({matchId:'match',roomId:'room',searching:false,invites},'me',0)).toBe(2);
 expect(cardActivityCount({matchId:null,searching:true,invites:[]},'me',0)).toBe(0);
});
it('places unfinished computer games on their character rather than online',()=>{
 const state={matchId:'m',searching:null,expiresAt:null,serverNow:0,invites:[]};
 expect(gameActivityCounts(state,'me','veronika')).toEqual({online:0,veronika:1});
 expect(gameActivityCounts(state,'me',null)).toEqual({online:1});
});
