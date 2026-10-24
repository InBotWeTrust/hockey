import { QueryClient } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { scheduleChatRefresh, cancelChatRefresh } from './chatRefresh.js';
import { chatKeys } from '../lib/queryKeys.js';
afterEach(()=>{vi.useRealTimers();});
it('coalesces a message burst into one list and unread reconciliation', async()=>{
 vi.useFakeTimers();const client=new QueryClient();const refresh=vi.spyOn(client,'invalidateQueries');
 for(let i=0;i<30;i++)scheduleChatRefresh(client,chatKeys.list(),chatKeys.unread());
 expect(refresh).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(50);
 expect(refresh).toHaveBeenCalledTimes(2);
});
it('cancels pending refreshes when the socket owner changes', async()=>{
 vi.useFakeTimers();const client=new QueryClient();const refresh=vi.spyOn(client,'invalidateQueries');
 scheduleChatRefresh(client,chatKeys.list());cancelChatRefresh(client);await vi.runAllTimersAsync();
 expect(refresh).not.toHaveBeenCalled();
});
