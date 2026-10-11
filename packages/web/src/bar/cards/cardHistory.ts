import type { ComputerOpponentId } from './computerOpponents.js';
export interface CompletedCardGame {
  id: string;
  character: ComputerOpponentId;
  result: 'win' | 'loss' | 'draw';
  startedAt: string;
  endedAt: string;
  surrendered: boolean;
  caughtCheats: number;
}

const prefix = 'hockey.bar.card-result.v1:';
function isMatch(value: unknown): value is CompletedCardGame {
  if (!value || typeof value !== 'object') return false;
  const match = value as Partial<CompletedCardGame>;
  return typeof match.id === 'string' && /^[0-9a-f-]{36}$/i.test(match.id)
    && ['maria','daria','grigory','arsenich'].includes(match.character ?? '')
    && ['win','loss','draw'].includes(match.result ?? '')
    && typeof match.startedAt === 'string' && Number.isFinite(Date.parse(match.startedAt))
    && typeof match.endedAt === 'string' && Number.isFinite(Date.parse(match.endedAt))
    && typeof match.surrendered === 'boolean' && Number.isInteger(match.caughtCheats);
}
export function createCardHistoryOutbox(
  storage: Storage,
  currentOwner: () => string | null,
  deliver: (owner: string, match: CompletedCardGame) => Promise<void>,
) {
  let active: Promise<void> | null = null;
  return {
    enqueue(owner: string, match: CompletedCardGame) {
      if (!isMatch(match)) throw new Error('invalid_card_result');
      // One storage entry per match avoids lost updates between tabs adding different games.
      const key = `${prefix}${owner}:${match.id}`;
      const body = JSON.stringify(match);
      const old = storage.getItem(key);
      if (old !== null && old !== body) throw new Error('card_result_conflict');
      storage.setItem(key,body);
    },
    flush(): Promise<void> {
      if (active) return active;
      active = (async () => {
        const owner = currentOwner();
        if (!owner) return;
        const ownerPrefix = `${prefix}${owner}:`;
        const keys = Array.from({ length: storage.length },(_,i) => storage.key(i))
          .filter((key): key is string => key?.startsWith(ownerPrefix) ?? false).sort().slice(0,20);
        for (const key of keys) {
          if (currentOwner() !== owner) return;
          const body = storage.getItem(key);
          if (!body) continue;
          let value: unknown;
          try { value = JSON.parse(body); } catch { continue; }
          if (!isMatch(value)) continue;
          try { await deliver(owner,value); } catch { return; }
          if (storage.getItem(key) === body) storage.removeItem(key);
        }
      })().catch(() => undefined).finally(() => { active = null; });
      return active;
    },
  };
}
