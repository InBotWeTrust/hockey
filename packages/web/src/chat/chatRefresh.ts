import type { QueryClient, QueryKey } from '@tanstack/react-query';
interface RefreshQueue { keys: Map<string, QueryKey>; timer?: ReturnType<typeof setTimeout>; running: boolean; cancelled: boolean }
const queues = new WeakMap<QueryClient, RefreshQueue>();

/** WS patches remain immediate; only the authoritative list/count reconciliation is batched. */
export function scheduleChatRefresh(client: QueryClient, ...keys: QueryKey[]): void {
  let queue = queues.get(client);
  if (!queue) { queue = {keys:new Map(),running:false,cancelled:false}; queues.set(client,queue); }
  for (const key of keys) queue.keys.set(JSON.stringify(key),key);
  if (queue.running || queue.timer !== undefined) return;
  const current = queue;
  current.timer = setTimeout(() => {
    delete current.timer; current.running = true;
    const batch = [...current.keys.values()]; current.keys.clear();
    void Promise.allSettled(batch.map(queryKey => client.invalidateQueries({queryKey}))).then(() => {
      current.running = false;
      if (current.cancelled) return;
      if (current.keys.size) scheduleChatRefresh(client);
      else queues.delete(client);
    });
  },50);
}
export function cancelChatRefresh(client: QueryClient): void {
  const queue = queues.get(client); if (!queue) return;
  queue.cancelled = true; clearTimeout(queue.timer); queues.delete(client);
}
