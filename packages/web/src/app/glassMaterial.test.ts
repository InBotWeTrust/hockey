import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const designSystemCss = readFileSync(path.resolve('src/app/design-system.css'), 'utf8');
const liquidGlassCss = readFileSync(path.resolve('src/app/liquid-glass.css'), 'utf8');

function mountStyles(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = liquidGlassCss;
  document.head.append(style);
  return style;
}

function mountDesignSystem(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = designSystemCss + liquidGlassCss;
  document.head.append(style);
  return style;
}

describe('unified glass material', () => {
  afterEach(() => {
    document.body.replaceChildren();
    document.head.querySelectorAll('style').forEach((style) => style.remove());
  });

  it('shares neutral material aliases across chrome, cards, and elevated panels', () => {
    mountStyles();
    const shell = document.createElement('div');
    shell.className = 'app-shell app-shell--unified-glass';
    document.body.append(shell);
    const styles = getComputedStyle(shell);
    expect(styles.getPropertyValue('--surface-card-bg').trim()).toBe('var(--liquid-card-bg)');
    expect(styles.getPropertyValue('--surface-filter-bg').trim()).toBe('var(--liquid-chrome-bg)');
    expect(styles.getPropertyValue('--surface-elevated-bg').trim()).toBe('var(--liquid-modal-bg)');
    expect(styles.getPropertyValue('--chrome-surface-bg').trim()).toBe('var(--liquid-chrome-bg)');
    // Portal overlays must resolve the material without an app-shell ancestor.
    const rootStyles = getComputedStyle(document.documentElement);
    expect(rootStyles.getPropertyValue('--liquid-modal-bg').trim()).not.toBe('');
    expect(rootStyles.getPropertyValue('--liquid-ink').trim()).not.toBe('');
  });

  it('uses the same material aliases on the personal profile tab', () => {
    mountStyles();
    const shell = document.createElement('div');
    shell.className = 'app-shell app-shell--profile-tab';
    document.body.append(shell);
    expect(getComputedStyle(shell).getPropertyValue('--surface-card-bg').trim()).toBe(
      'var(--liquid-card-bg)',
    );
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

  it('uses light text for the selected playoff round on the dark active surface', () => {
    const style = mountDesignSystem();
    const selectedRoundRule = Array.from(style.sheet?.cssRules ?? [])
      .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
      .find((rule) =>
        rule.selectorText.includes(
          '.app-shell--unified-glass .tournament-bracket__round-tabs button.is-active',
        ),
      );

    expect(selectedRoundRule?.style.getPropertyValue('color')).toBe('#ffffff');
  });

  it('keeps the chat search control as light as the back control on the arena background', () => {
    const style = mountDesignSystem();
    const sharedControlRule = Array.from(style.sheet?.cssRules ?? [])
      .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
      .find((rule) => rule.selectorText === '.icon-btn.chat-room-header__control--surface');

    expect(sharedControlRule).toBeDefined();
    expect(sharedControlRule?.style.getPropertyValue('background')).toBe(
      'var(--chrome-surface-bg)',
    );
    expect(sharedControlRule?.style.getPropertyValue('border-color')).toBe(
      'var(--chrome-surface-border)',
    );
    expect(sharedControlRule?.style.getPropertyValue('color')).toBe('var(--liquid-ink)');
  });

  it('keeps profile sections separate from the official account hero styles', () => {
    mountDesignSystem();
    const profileSection = document.createElement('section');
    profileSection.className = 'profile-equipment-section';
    document.body.append(profileSection);

    const styles = getComputedStyle(profileSection);
    expect(styles.display).toBe('grid');
    expect(styles.minHeight).not.toBe('200px');
    expect(styles.backgroundColor).not.toBe('rgb(24, 38, 58)');
  });
});
