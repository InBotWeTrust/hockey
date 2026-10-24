import { expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRatingCacheWindow } from './ratingCache.js';
it('keeps the first snapshot but drops deep pages after closing a ranking', () => {
 const client = new QueryClient();
 const key = ['profile','stat-rating','goals'];
 const pages = Array.from({length:20},(_,i)=>({rows:[{id:i}],nextCursor:String(i+1)}));
 client.setQueryData(key,{pages,pageParams:[null,...Array.from({length:19},(_,i)=>String(i+1))]},{updatedAt:100});
 const view=renderHook(()=>useRatingCacheWindow(key),{wrapper:({children})=><QueryClientProvider client={client}>{children}</QueryClientProvider>});
 view.unmount();
 expect(client.getQueryData(key)).toEqual({pages:[pages[0]],pageParams:[null]});
 expect(client.getQueryState(key)?.dataUpdatedAt).toBe(100);
 client.clear();
});
