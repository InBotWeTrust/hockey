import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/app/design-system.css', 'utf8');

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  const end = css.indexOf('\n}', start);
  return css.slice(start, end + 2);
}

describe('design system toast positioning', () => {
  it('anchors inventory purchase notifications to the shared centered top position', () => {
    const inventoryToast = rule('.inventory-purchase-toast');
    expect(inventoryToast).toContain('top: calc(var(--app-safe-top) + 14px)');
    expect(inventoryToast).toContain('left: 50%');
    expect(inventoryToast).not.toContain('bottom:');
    expect(inventoryToast).toContain('animation: duel-challenge-toast-in');
  });
});

describe('experience rating scroll containment', () => {
  it('disables scroll chaining and gives the sticky header an opaque surface', () => {
    const viewport = rule('.experience-rating__viewport');
    const header = rule('.tournament-standing-table--experience-rating th');

    expect(viewport).toContain('overscroll-behavior: none');
    expect(header).toContain('background: rgb(186, 195, 208)');
    expect(header).not.toContain('background: transparent');
  });
});
