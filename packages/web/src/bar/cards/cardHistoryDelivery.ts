import { useEffect } from 'react';
import { useAuthStore } from '../../auth/authStore.js';
import { getApiBaseUrl } from '../../platform/runtime.js';
import { createCardHistoryOutbox, type CompletedCardGame } from './cardHistory.js';
let outbox: ReturnType<typeof createCardHistoryOutbox> | undefined;
function box() {
  outbox ??= createCardHistoryOutbox(localStorage, () => useAuthStore.getState().user?.id ?? null,
    async (owner,match) => {
      const auth = useAuthStore.getState();
      if (auth.user?.id !== owner || !auth.accessToken) throw new Error('owner_changed');
      // Capture this account's token. Do not retry an old account's report with a refreshed new account.
      const response = await fetch(`${getApiBaseUrl()}/bar/card-history`, {
        method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.accessToken}` },
        body: JSON.stringify(match),
      });
      if (!response.ok) throw new Error('card_history_delivery_failed');
      const result = await response.json() as { saved?: boolean };
      if (result.saved !== true) throw new Error('card_history_not_acknowledged');
    });
  return outbox;
}
export function recordCardGame(owner: string, match: CompletedCardGame): void {
  box().enqueue(owner,match);
  void box().flush();
}
export function useCardHistoryDelivery(): void {
  const owner = useAuthStore(state => state.user?.id);
  const token = useAuthStore(state => state.accessToken);
  useEffect(() => {
    if (!owner || !token) return;
    const flush = () => { void box().flush(); };
    flush();
    const timer = window.setInterval(flush,30000);
    window.addEventListener('online',flush);
    window.addEventListener('storage',flush);
    return () => { window.clearInterval(timer); window.removeEventListener('online',flush); window.removeEventListener('storage',flush); };
  },[owner,token]);
}
