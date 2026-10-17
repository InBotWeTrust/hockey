import { visitorCharacters, type VisitorSettings, type VisitorState } from '@hockey/game-core';
export const defaultVisitorSettings: VisitorSettings = {
  cardDays: 30,
  freeMessages: 10,
  cardMessages: 30,
  freeGames: 3,
  cardGames: 2,
  products: [
    {
      id: 'visitor-card',
      title: 'Карта посетителя',
      kind: 'card',
      amount: 1,
      coins: 14900,
      stars: 300,
    },
    {
      id: 'messages-10',
      title: '10 сообщений',
      kind: 'messages',
      amount: 10,
      coins: 1000,
      stars: 20,
    },
    {
      id: 'messages-30',
      title: '30 сообщений',
      kind: 'messages',
      amount: 30,
      coins: 2500,
      stars: 50,
    },
    {
      id: 'messages-100',
      title: '100 сообщений',
      kind: 'messages',
      amount: 100,
      coins: 6000,
      stars: 120,
    },
  ],
};
export interface VisitorAccount {
  purchasedAt: string | null;
  expiresAt: string | null;
  paidMessages: number;
  messagesUsed: number;
  gamesUsed: Record<string, number>;
  resetAt: string;
}
export function visitorSnapshot(
  account: VisitorAccount,
  settings: VisitorSettings,
  now: number,
): VisitorState {
  const active = account.expiresAt !== null && Date.parse(account.expiresAt) > now;
  const limit = active ? settings.cardMessages : settings.freeMessages;
  const totalGames = Object.values(account.gamesUsed).reduce((a, b) => a + b, 0);
  const remainingGames = Math.max(0, settings.freeGames - totalGames);
  return {
    serverNow: new Date(now).toISOString(),
    resetAt: account.resetAt,
    card: { purchased: account.purchasedAt !== null, active, expiresAt: account.expiresAt },
    messages: {
      limit,
      used: account.messagesUsed,
      remaining: Math.max(0, limit - account.messagesUsed),
      paid: account.paidMessages,
    },
    games: {
      limit: active ? settings.cardGames : settings.freeGames,
      remaining: active
        ? visitorCharacters.reduce(
            (n, c) => n + Math.max(0, settings.cardGames - (account.gamesUsed[c] ?? 0)),
            0,
          )
        : remainingGames,
      byCharacter: Object.fromEntries(
        visitorCharacters.map((c) => [
          c,
          active ? Math.max(0, settings.cardGames - (account.gamesUsed[c] ?? 0)) : remainingGames,
        ]),
      ),
    },
  };
}
export function messageSource(
  account: VisitorAccount,
  settings: VisitorSettings,
  now: number,
): 'daily' | 'paid' | null {
  const state = visitorSnapshot(account, settings, now);
  return state.messages.remaining > 0 ? 'daily' : state.messages.paid > 0 ? 'paid' : null;
}
export const extendVisitorCard = (expiresAt: string | null, days: number, now: number) =>
  new Date(Math.max(now, expiresAt ? Date.parse(expiresAt) : now) + days * 86400000).toISOString();
