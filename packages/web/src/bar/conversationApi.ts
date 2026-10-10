import { apiFetch } from '../api/apiFetch.js';
export const barCharacters = [
  'maria',
  'daria',
  'grigory',
  'arsenich',
  'veronika',
  'oleg',
  'timofey',
] as const;
export type BarCharacter = (typeof barCharacters)[number];
export interface ConversationSnapshot {
  greeting: string;
  revision: number;
  pending: boolean;
  turns: { id: string; user: string; assistant: string; createdAt: string }[];
  preview?: boolean;
}
export interface ConversationMessage {
  id: string;
  revision: number;
  content: string;
}
export const fetchConversation = (character: BarCharacter) =>
  apiFetch<ConversationSnapshot>(`/bar/conversations/${character}`);
export const sendConversation = (character: BarCharacter, message: ConversationMessage) =>
  apiFetch<ConversationSnapshot>(`/bar/conversations/${character}`, {
    method: 'POST',
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(45000),
  });
