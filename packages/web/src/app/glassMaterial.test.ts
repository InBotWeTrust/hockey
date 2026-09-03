import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const designSystemCss = readFileSync(path.resolve('src/app/design-system.css'), 'utf8');

function mountStyles(): HTMLStyleElement {
  const tokenRule = designSystemCss.match(/\.app-shell--unified-glass\s*\{[^}]+\}/)?.[0];
  if (tokenRule === undefined) {
    throw new Error('Unified glass material rules are missing');
  }
  const style = document.createElement('style');
  style.textContent = tokenRule;
  document.head.append(style);
  return style;
}

function mountDesignSystem(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = designSystemCss;
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
    expect(styles.getPropertyValue('--surface-card-bg').trim()).toBe('rgba(226, 233, 241, 0.64)');
    expect(styles.getPropertyValue('--surface-filter-bg').trim()).toBe('rgba(226, 236, 246, 0.76)');
    expect(styles.getPropertyValue('--surface-calendar-day-bg').trim()).toBe(
      'rgba(226, 233, 241, 0.74)',
    );
    expect(styles.getPropertyValue('--surface-calendar-day-muted-bg').trim()).toBe(
      'rgba(226, 234, 243, 0.4)',
    );
    expect(styles.getPropertyValue('--surface-calendar-day-border').trim()).toBe(
      'rgba(255, 255, 255, 0.78)',
    );
    expect(styles.getPropertyValue('--surface-elevated-bg').trim()).toBe(
      'rgba(237, 244, 250, 0.74)',
    );
    expect(styles.getPropertyValue('--surface-border').trim()).toBe('rgba(255, 255, 255, 0.78)');
    expect(styles.getPropertyValue('--surface-card-shadow').trim()).toContain(
      'inset 0 1px 0 rgba(255, 255, 255, 0.72)',
    );
    expect(styles.getPropertyValue('--surface-elevated-shadow').trim()).toContain(
      '0 0 0 2px rgba(74, 144, 226, 0.12)',
    );
    expect(styles.getPropertyValue('--surface-filter-shadow').trim()).toContain(
      '0 8px 22px rgba(2, 8, 23, 0.14)',
    );
    expect(styles.getPropertyValue('--surface-blur').trim()).toBe(
      'blur(10px) saturate(120%)',
    );
    expect(styles.getPropertyValue('--surface-control-blur').trim()).toBe(
      'blur(16px) saturate(125%)',
    );
  });

  it('does not inject the unified surface tokens into the personal profile tab', () => {
    mountStyles();
    const shell = document.createElement('div');
    shell.className = 'app-shell app-shell--profile-tab';
    document.body.append(shell);

    expect(getComputedStyle(shell).getPropertyValue('--surface-card-bg').trim()).toBe('');
  });

  it('keeps active section cards on the same blurred material as other large cards', () => {
    const style = mountDesignSystem();
    const activeCardRule = Array.from(style.sheet?.cssRules ?? [])
      .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
      .find(
        (rule) =>
          rule.selectorText.includes('.app-shell--unified-glass') &&
          rule.selectorText.includes('.bonus-game-card--featured') &&
          rule.selectorText.includes('.section-card-surface--active'),
      );

    expect(activeCardRule?.style.getPropertyValue('backdrop-filter')).toBe(
      'var(--surface-blur)',
    );
  });

  it('uses dark text for the selected playoff round on the light glass surface', () => {
    const style = mountDesignSystem();
    const selectedRoundRule = Array.from(style.sheet?.cssRules ?? [])
      .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
      .find((rule) =>
        rule.selectorText.includes(
          '.app-shell--unified-glass .tournament-bracket__round-tabs button.is-active',
        ),
      );

    expect(selectedRoundRule?.style.getPropertyValue('color')).toBe('#13233c');
  });
});
