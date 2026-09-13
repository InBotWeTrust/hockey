import { QueryClient, type QueryKey } from '@tanstack/react-query';

const SESSION_OWNED_QUERY_PREFIXES: readonly QueryKey[] = [
  ['profile'],
  ['inventory'],
  ['bonus-games'],
  ['achievements'],
  ['weekly-challenge'],
  ['home-arenas'],
  ['training', 'history'],
  ['daily', 'history'],
];

export function createAppQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });

  for (const queryKey of SESSION_OWNED_QUERY_PREFIXES) {
    client.setQueryDefaults(queryKey, {
      staleTime: Infinity,
      gcTime: Infinity,
      refetchOnMount: true,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
    });
  }

  client.setQueryDefaults(['tournaments'], {
    staleTime: 5 * 60_000,
    gcTime: Infinity,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  return client;
}

export const queryClient = createAppQueryClient();

type CachedProfileBalances = {
  currencyBalance?: number;
  starBalance?: number;
  experienceBalance?: number;
};

export function updateCachedProfileBalances(
  client: QueryClient,
  balances: CachedProfileBalances,
): void {
  client.setQueriesData<Record<string, unknown>>({ queryKey: ['profile'] }, (current) => {
    if (current === undefined) return current;
    const next: Record<string, unknown> = { ...current };
    if (balances.currencyBalance !== undefined) {
      next.currencyBalance = balances.currencyBalance;
    }
    if (balances.starBalance !== undefined) next.starBalance = balances.starBalance;
    if (balances.experienceBalance !== undefined) {
      next.experienceBalance = balances.experienceBalance;
    }
    return next;
  });
}

export function updateCachedInventoryBalances(
  client: QueryClient,
  balances: Required<CachedProfileBalances>,
): void {
  client.setQueryData<Record<string, unknown>>(['inventory', 'me'], (current) => {
    if (current === undefined) return current;
    const currentBalances =
      typeof current.balances === 'object' && current.balances !== null
        ? (current.balances as Record<string, unknown>)
        : {};
    return {
      ...current,
      balances: {
        ...currentBalances,
        tokens: balances.currencyBalance,
        stars: balances.starBalance,
        experience: balances.experienceBalance,
      },
    };
  });
}
