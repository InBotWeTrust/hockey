import { expect, it } from 'vitest';
import { characters } from './conversationRoutes.js';
import { personaOf } from './personas.js';
it('loads a valid persona for every supported conversational character', () => {
  for (const character of characters) {
    expect(personaOf(character).soul).toBeTruthy();
    expect(personaOf(character).biography.facts.length).toBeGreaterThan(0);
  }
});
it('gives every character the same authored roster and Timofey relationship',()=>{
 for(const character of characters){
  expect(personaOf(character).setting).toContain('Мария');
  expect(personaOf(character).setting).toContain('Дарья');
  expect(personaOf(character).setting).toContain('Тимофей — начальник Григория');
 }
 expect(personaOf('timofey').soul).toContain('начальник Григория');
});

it('gives Elina ownership and conversation without a game objective',()=>{
 expect(characters).toContain('elina');
 expect(personaOf('elina').soul).toContain('владелица');
 expect(personaOf('elina').soul).toContain('обычный разговор');
});
