import { expect, it } from 'vitest';
import { visitorPhrase, visitorPhrases } from '../src/visitorPhrases.js';
it('has 45 approved phrases and never immediately repeats a refusal', () => {
  expect(
    Object.values(visitorPhrases).reduce((n, p) => n + p.messages.length + p.games.length, 0),
  ).toBe(45);
  for (const [character, phrases] of Object.entries(visitorPhrases)) {
    for (const kind of ['messages', 'games'] as const) {
      if (!phrases[kind].length) continue;
      for (const previous of phrases[kind])
        expect(visitorPhrase(character, kind, previous, 0)).not.toBe(previous);
    }
  }
});
