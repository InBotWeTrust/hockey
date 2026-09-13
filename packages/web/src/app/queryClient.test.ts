import { describe, expect, it } from 'vitest';
import {
  createAppQueryClient,
  updateCachedInventoryBalances,
  updateCachedProfileBalances,
} from './queryClient.js';

describe('createAppQueryClient', () => {
  it.each([
    ['profile'],
    ['inventory', 'me'],
    ['bonus-games'],
    ['achievements'],
    ['weekly-challenge'],
    ['home-arenas'],
    ['training', 'history'],
    ['daily', 'history'],
  ])('keeps user-owned query %j fresh for the app session', (...queryKey) => {
    const client = createAppQueryClient();

    expect(client.getQueryDefaults(queryKey)).toMatchObject({
      staleTime: Infinity,
      gcTime: Infinity,
      refetchOnMount: true,
    });
  });

  it.each([
    ['daily', 'state'],
    ['amateur-duel', 'matches'],
    ['chat'],
    ['admin', 'attention'],
  ])('leaves live query %j on the realtime policy', (...queryKey) => {
    const client = createAppQueryClient();

    expect(client.getQueryDefaults(queryKey).staleTime).not.toBe(Infinity);
  });

  it('revalidates shared tournament data periodically instead of on every navigation', () => {
    const client = createAppQueryClient();

    expect(client.getQueryDefaults(['tournaments'])).toMatchObject({
      staleTime: 5 * 60_000,
      gcTime: Infinity,
      refetchOnMount: true,
    });
  });
});

describe('updateCachedProfileBalances', () => {
  it('patches every cached profile variant without creating a new request', () => {
    const client = createAppQueryClient();
    client.setQueryData(['profile'], { displayName: 'Игрок', currencyBalance: 100 });
    client.setQueryData(['profile', 'sections'], {
      displayName: 'Игрок',
      currencyBalance: 100,
      pendingTournamentCongratulations: [],
    });

    updateCachedProfileBalances(client, {
      currencyBalance: 80,
      starBalance: 7,
      experienceBalance: 12,
    });

    expect(client.getQueryData(['profile'])).toMatchObject({
      displayName: 'Игрок',
      currencyBalance: 80,
      starBalance: 7,
      experienceBalance: 12,
    });
    expect(client.getQueryData(['profile', 'sections'])).toMatchObject({
      pendingTournamentCongratulations: [],
      currencyBalance: 80,
      starBalance: 7,
      experienceBalance: 12,
    });
  });
});

describe('updateCachedInventoryBalances', () => {
  it('patches cached inventory balances while preserving the item catalog', () => {
    const client = createAppQueryClient();
    client.setQueryData(['inventory', 'me'], {
      balances: { tokens: 100, stars: 2, experience: 3 },
      items: { stick: [] },
    });

    updateCachedInventoryBalances(client, {
      currencyBalance: 140,
      starBalance: 4,
      experienceBalance: 8,
    });

    expect(client.getQueryData(['inventory', 'me'])).toEqual({
      balances: { tokens: 140, stars: 4, experience: 8 },
      items: { stick: [] },
    });
  });
});
