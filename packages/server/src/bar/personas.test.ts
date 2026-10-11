import { expect, it } from 'vitest';
import { characters } from './conversationRoutes.js';
import { personaOf } from './personas.js';
it('loads a valid persona for every supported conversational character', () => {
  for (const character of characters) {
    expect(personaOf(character).soul).toBeTruthy();
    expect(personaOf(character).biography.facts.length).toBeGreaterThan(0);
  }
});
