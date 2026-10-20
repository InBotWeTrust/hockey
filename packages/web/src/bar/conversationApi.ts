import type {CharacterEmotion} from './characterEmotion.js';
import { apiFetch } from '../api/apiFetch.js';
export const barCharacters = [
  'maria',
  'daria',
  'grigory',
  'arsenich',
  'veronika',
  'oleg',
  'timofey',
  'igor',
] as const;
export type BarCharacter = (typeof barCharacters)[number];
export type ConversationCharacter=BarCharacter|'elina';
export interface ConversationSnapshot {
  greeting: string;
  revision: number;
  pending: boolean;
  interventionActive?: boolean;
  turns: { id: string; user: string; assistant: string; createdAt: string; speaker?: ConversationCharacter; intervention?: string; fightId?: string; event?: 'physical'; emotion?:CharacterEmotion; farewell?: string; officeDay?:string }[];
  preview?: boolean;
}
export interface ConversationMessage {
  id: string;
  revision: number;
  content: string;
  conflictAction?: 'apologize' | 'challenge';
}
export const fetchConversation = (character: ConversationCharacter) =>
  apiFetch<ConversationSnapshot>(`/bar/conversations/${character}`);
export const sendConversation = (character: ConversationCharacter, message: ConversationMessage) =>
  apiFetch<ConversationSnapshot>(`/bar/conversations/${character}`, {
    method: 'POST',
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(120000),
  });

export const sendPhysicalIncident=(character:BarCharacter,eventId:string)=>apiFetch<ConversationSnapshot>(`/bar/conversations/${character}/physical-incident`,{method:'POST',body:JSON.stringify({eventId})});
