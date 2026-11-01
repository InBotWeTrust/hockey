import type {Interest} from './elinaMeeting.js';
import {publicEventQuerySchema} from './publicEvents.js';
import type { CharacterEmotion } from './characterEmotion.js';
import { z } from 'zod';
import type { SqlCardHistoryStore } from './cardHistory.js';
import type { Story } from './personas.js';
export interface MemoryFact {
  id: string;
  kind: 'fact' | 'agreement' | 'shared_joke';
  content: string;
  sourceTurnId: string;
  quote: string;
}
export interface ConversationContext {
  novice?: boolean;
  elinaMeeting?: {remaining:number;personalAllowed:boolean;successful:boolean;regular:boolean;competitionLevel:string;achievements?:unknown};
  boundaryWarning?: 'insult'|'sexual';
  fightMemories?: unknown;
  barBehaviour?: unknown;
  historyStart?: number;
  recentGames?: Awaited<ReturnType<SqlCardHistoryStore['memories']>>;
  summary: string;
  facts: MemoryFact[];
  relationship: string[];
  tool: (name: ToolName, args: ToolArguments, signal?: AbortSignal) => Promise<unknown>;
}
export interface GeneratedAnswer { text: string; usedStoryIds: string[]; emotion?:CharacterEmotion; interest?:Interest }
export const newStorySchema = z.object({
  title: z.string().trim().min(1).max(100),
  content: z.string().trim().min(20).max(1200),
  topics: z.array(z.string().trim().min(1).max(40)).min(1).max(6),
  disclosure: z.enum(['casual', 'personal']),
}).strict();
export type NewStory = z.infer<typeof newStorySchema>;
export const topicSchema = z.object({ topic: z.string().trim().max(200) }).strict();
export const toolSchemas = { find_stories: topicSchema, game_memories: topicSchema, propose_story: newStorySchema, public_bar_events:publicEventQuerySchema };
export type ToolName = keyof typeof toolSchemas;
export type ToolArguments = z.infer<typeof topicSchema> | NewStory | z.infer<typeof publicEventQuerySchema>;
export type KnownStory = Story & { told: boolean };
