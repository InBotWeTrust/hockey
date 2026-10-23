import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {act,renderHook,waitFor} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import type {ReactNode} from 'react';
import {useNavigationActivity} from './useNavigationActivity.js';
import {useChatStore} from '../chat/chatStore.js';
import {chatKeys} from '../lib/queryKeys.js';
afterEach(()=>useChatStore.getState().setUnread({}));
it('counts messages rather than conversations and clears a read badge despite stale list cache',()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 client.setQueryData(chatKeys.list(),[{id:'one',unreadCount:3},{id:'two',unreadCount:2}]);
 client.setQueryData(['social','unread'],{unreadCount:50});
 const view=renderHook(()=>useNavigationActivity(false),{wrapper:({children}:{children:ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>});
 expect(view.result.current.unreadMessageCount).toBe(5);
 act(()=>useChatStore.getState().resetUnread('one'));
 expect(view.result.current.unreadMessageCount).toBe(2);
 view.unmount();client.clear();
});

it('keeps unfinished duels in navigation while ready, on break or waiting for the opponent',()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 client.setQueryData(['amateur-duel','events'],{events:[
  {id:'ready',status:'ready_check',source:'challenge',me:{state:'ready'},opponent:{state:'accepted'}},
  {id:'break',status:'active',source:'challenge',me:{state:'break_active'},opponent:{state:'period_active'}},
  {id:'waiting',status:'active',source:'challenge',me:{state:'completed'},opponent:{state:'period_active'}},
  {id:'incoming',status:'invited',source:'challenge',me:{side:'opponent',state:'invited'}},
  {id:'outgoing',status:'invited',source:'challenge',me:{side:'challenger',state:'invited'}},
  {id:'done',status:'settled',source:'challenge',me:{state:'completed'}},
 ]});
 const view=renderHook(()=>useNavigationActivity(false),{wrapper:({children}:{children:ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>});
 expect(view.result.current.duelActivityCount).toBe(4);
 expect(view.result.current.stadiumActivityCount).toBe(4);
 view.unmount();client.clear();
});
it('counts regular and classic/playoff tournament games once, separately from ordinary duels',async()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 client.setQueryData(['amateur-duel','events'],{events:[
  {id:'regular',source:'tournament',status:'active',me:{state:'break_active'}},
  {id:'playoff',source:'tournament',status:'ready_check',me:{state:'ready'},opponent:{state:'accepted'}},
 ]});
 client.setQueryData(['tournaments','classic','active'],{games:[
  {kind:'classic',tournament_id:'classic',state:'available'},
  {kind:'playoff',fixture_id:'fixture',duel_match_id:'playoff',state:'ready_check',my_ready:true},
  {kind:'classic',tournament_id:'closed',state:'closed'},
 ]});
 const view=renderHook(()=>useNavigationActivity(false),{wrapper:({children}:{children:ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>});
 expect(view.result.current.duelActivityCount).toBe(0);
 expect(view.result.current.tournamentActivityCount).toBe(3);
 expect(view.result.current.stadiumActivityCount).toBe(3);
 act(()=>client.setQueryData(['amateur-duel','events'],{events:[]}));
 act(()=>client.setQueryData(['tournaments','classic','active'],{games:[]}));
 await waitFor(()=>expect(view.result.current.stadiumActivityCount).toBe(0));
 view.unmount();client.clear();
});
