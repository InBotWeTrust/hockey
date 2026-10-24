import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useOwnProfileSummary } from './useOwnProfileSummary.js';
import { apiFetch } from '../api/apiFetch.js';
import { useAuthStore } from '../auth/authStore.js';
vi.mock('../api/apiFetch.js', () => ({apiFetch:vi.fn()}));
beforeEach(() => { vi.clearAllMocks(); useAuthStore.setState({user:{id:'me',displayName:'Игрок'}}); });
function wrapper(client: QueryClient) { return ({children}:{children:ReactNode}) => <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
it('shares a fresh account summary across screen mounts', async () => {
  vi.mocked(apiFetch).mockResolvedValue({id:'me',competitionLevel:'amateur'});
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const first=renderHook(()=>useOwnProfileSummary(),{wrapper:wrapper(client)});
  await waitFor(()=>expect(first.result.current.data?.competitionLevel).toBe('amateur')); first.unmount();
  const next=renderHook(()=>useOwnProfileSummary(),{wrapper:wrapper(client)});
  expect(next.result.current.data?.competitionLevel).toBe('amateur');
  expect(apiFetch).toHaveBeenCalledOnce();
  expect(apiFetch).toHaveBeenCalledWith('/me?summary=true&countersOnly=true',expect.anything());
});
it('reuses a loaded full profile without another metadata request', () => {
  const client=new QueryClient();client.setQueryData(['profile'],{id:'me',competitionLevel:'professional'});
  const {result}=renderHook(()=>useOwnProfileSummary(),{wrapper:wrapper(client)});
  expect(result.current.data?.competitionLevel).toBe('professional');expect(apiFetch).not.toHaveBeenCalled();
});
it('refreshes an invalidated full cache instead of using it indefinitely', async () => {
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 client.setQueryData(['profile'],{id:'me',competitionLevel:'beginner'});
 await client.invalidateQueries({queryKey:['profile']});
 vi.mocked(apiFetch).mockResolvedValue({id:'me',competitionLevel:'amateur'});
 const {result}=renderHook(()=>useOwnProfileSummary(),{wrapper:wrapper(client)});
 await waitFor(()=>expect(result.current.data?.competitionLevel).toBe('amateur'));
});
it('does not reuse the previous account profile',async()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 client.setQueryData(['profile'],{id:'other',competitionLevel:'professional'});
 vi.mocked(apiFetch).mockResolvedValue({id:'me',competitionLevel:'beginner'});
 const {result}=renderHook(()=>useOwnProfileSummary(),{wrapper:wrapper(client)});
 expect(result.current.data).toBeUndefined();
 await waitFor(()=>expect(result.current.data?.competitionLevel).toBe('beginner'));
});
