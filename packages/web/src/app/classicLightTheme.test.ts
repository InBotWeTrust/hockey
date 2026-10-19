import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const css = readFileSync('src/app/light-theme.css', 'utf8');
it('lets semantic icon colors inherit instead of forcing all icons black', () => {
  expect(css).not.toMatch(/\[data-theme='light'\] svg\.lucide\s*\{/);
});
