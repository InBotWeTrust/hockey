import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const css = readFileSync('src/app/light-theme.css', 'utf8');
it('lets semantic icon colors inherit instead of forcing all icons black', () => {
  expect(css).not.toMatch(/\[data-theme='light'\] svg\.lucide\s*\{/);
});
it('uses theme-aware cube foregrounds instead of fixed white text', () => {
  const source = readFileSync('src/screens/DailyScreen.tsx', 'utf8');
  expect(source).toContain('var(--arena-cube-ink, #f7feff)');
  expect(source).toContain('var(--arena-cube-copy, rgba(234, 246, 255, 0.9))');
});
