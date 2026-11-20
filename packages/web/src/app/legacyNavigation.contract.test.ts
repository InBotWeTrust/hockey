import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it.each(['./App.tsx', '../bar/cards/preview.tsx'])('does not mount the retired dock in %s', (path) => {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  expect(source).not.toMatch(/<BottomNav[\s/>]/);
  expect(source).not.toContain('app-shell--bottom-nav-visible');
});

it('keeps retired destination introductions out of the player shell', () => {
  const app = readFileSync('src/app/App.tsx', 'utf8');
  expect(app).not.toContain('<DestinationIntroductionGate');
});
