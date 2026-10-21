import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {act,renderHook} from '@testing-library/react';
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
