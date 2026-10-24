import { useEffect } from 'react';
import { hashKey, useQueryClient, type InfiniteData, type QueryKey } from '@tanstack/react-query';

/** Modals reopen at the top; retain that snapshot without refetching the entire old scroll. */
export function useRatingCacheWindow(key: QueryKey): void {
  const client = useQueryClient();
  const serializedKey = hashKey(key);
  useEffect(() => {
    const queryKey = JSON.parse(serializedKey) as QueryKey;
    return () => {
      const query = client.getQueryCache().find({ queryKey, exact: true });
      if (!query || query.getObserversCount() > 1) return;
      void client.cancelQueries({ queryKey, exact: true });
      const updatedAt = query.state.dataUpdatedAt;
      client.setQueryData<InfiniteData<unknown>>(queryKey, data => {
        if (!data || data.pages.length <= 1) return data;
        return { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) };
      }, { updatedAt });
    };
  }, [client, serializedKey]);
}
