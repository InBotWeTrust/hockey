import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const designSystemCss = readFileSync(path.resolve('src/app/design-system.css'), 'utf8');

function mountStyles(): HTMLStyleElement {
  const tokenRule = designSystemCss.match(/\.app-shell--unified-glass\s*\{[^}]+\}/)?.[0];
  if (tokenRule === undefined) {
    throw new Error('Unified glass token rule is missing');
  }
  const style = document.createElement('style');
  style.textContent = tokenRule;
  document.head.append(style);
  return style;
}

describe('unified glass material', () => {
  afterEach(() => {
    document.body.replaceChildren();
    document.head.querySelectorAll('style').forEach((style) => style.remove());
  });

  it('exposes the approved card, filter, and elevated surface tokens', () => {
    mountStyles();
    const shell = document.createElement('div');
    shell.className = 'app-shell app-shell--unified-glass';
    document.body.append(shell);

    const styles = getComputedStyle(shell);
    expect(styles.getPropertyValue('--surface-card-bg').trim()).toBe('rgba(226, 233, 241, 0.74)');
    expect(styles.getPropertyValue('--surface-filter-bg').trim()).toBe('rgba(226, 236, 246, 0.78)');
    expect(styles.getPropertyValue('--surface-elevated-bg').trim()).toBe(
      'rgba(237, 244, 250, 0.84)',
    );
  });

  it('does not inject the unified surface tokens into the personal profile tab', () => {
    mountStyles();
    const shell = document.createElement('div');
    shell.className = 'app-shell app-shell--profile-tab';
    document.body.append(shell);

    expect(getComputedStyle(shell).getPropertyValue('--surface-card-bg').trim()).toBe('');
  });
});
