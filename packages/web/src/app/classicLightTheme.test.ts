import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const css = readFileSync('src/app/light-theme.css', 'utf8');
it('lets semantic icon colors inherit instead of forcing all icons black', () => {
  expect(css).not.toMatch(/\[data-theme='light'\] svg\.lucide\s*\{/);
});
it('uses theme-aware cube foregrounds instead of fixed white text', () => {
  const source = readFileSync('src/city/GameHub.tsx', 'utf8');
  expect(source).toContain('var(--arena-cube-ink, #f7feff)');
  expect(source).toContain('var(--arena-cube-copy, rgba(234, 246, 255, 0.9))');
});

it('keeps neutral glass overrides off historical light surfaces', () => {
  const style = document.createElement('style');
  style.textContent = readFileSync('src/app/liquid-glass.css', 'utf8');
  document.head.append(style);
  document.documentElement.dataset.theme = 'light';
  document.body.innerHTML = `<main class="app-shell app-shell--unified-glass"><div class="modal-card"><div class="glass"></div><div class="daily-result-modal__period"></div></div><div class="glass-dark chat-reading-surface chat-bubble--own"></div></main>`;
  const leaks: string[] = [];
  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        if (rule.selectorText.includes('.chat-bubble--own') && document.querySelector(rule.selectorText)) leaks.push(rule.selectorText);
      } else if ('cssRules' in rule && rule.type !== 7) {
        visit((rule as CSSGroupingRule).cssRules);
      }
    }
  };
  visit(style.sheet!.cssRules);
  style.remove();
  expect(leaks).toEqual([]);
  document.body.innerHTML = '';
  delete document.documentElement.dataset.theme;
});
