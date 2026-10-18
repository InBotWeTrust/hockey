export const visitorCharacters = [
  'maria',
  'daria',
  'grigory',
  'arsenich',
  'veronika',
  'oleg',
  'timofey',
] as const;
export interface VisitorProduct {
  id: string;
  title: string;
  kind: 'card' | 'messages';
  amount: number;
  coins: number;
  stars: number;
}
export interface VisitorSettings {
  cardDays: number;
  freeMessages: number;
  cardMessages: number;
  freeGames: number;
  cardGames: number;
  products: VisitorProduct[];
}
export interface VisitorState {
  serverNow: string;
  resetAt: string;
  card: { purchased: boolean; active: boolean; expiresAt: string | null };
  messages: { limit: number; used: number; remaining: number; paid: number };
  games: { limit: number; remaining: number; byCharacter: Record<string, number> };
}
