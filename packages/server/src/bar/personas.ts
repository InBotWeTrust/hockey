import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { Character } from './conversationRoutes.js';
export const storySchema = z.object({
  id: z.string().min(1).max(100), title: z.string().min(1).max(100),
  content: z.string().min(1).max(1600), topics: z.array(z.string().max(40)).max(8),
  disclosure: z.enum(['casual', 'personal']),
}).strict();
const biographySchema = z.object({ version: z.number().int().positive(), facts: z.array(z.string().max(1000)).max(16), stories: z.array(storySchema).max(20) }).strict();
export type Story = z.infer<typeof storySchema>;
export interface Persona { soul: string; common: string; biography: z.infer<typeof biographySchema> }
const cache = new Map<Character, Persona>();
export function personaOf(character: Character): Persona {
  let persona = cache.get(character);
  if (!persona) {
    const root = new URL('../../personas/', import.meta.url);
    persona = {
      soul: readFileSync(new URL(`${character}/soul.md`, root), 'utf8'),
      common: readFileSync(new URL('common-rules.md', root), 'utf8'),
      biography: biographySchema.parse(JSON.parse(readFileSync(new URL(`${character}/biography.json`, root), 'utf8'))),
    };
    cache.set(character, persona);
  }
  return persona;
}
export function selectStories(stories: Story[], topic: string, limit = 3): Story[] {
  const words = topic.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 2).slice(0, 12);
  return stories.map(story => ({ story, score: words.reduce((sum, word) => sum + (JSON.stringify(story).toLowerCase().includes(word) ? 1 : 0), 0) }))
    .sort((a, b) => b.score - a.score).slice(0, limit).map(item => item.story);
}
