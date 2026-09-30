import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/app/global.css', 'utf8');

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  const end = css.indexOf('\n}', start);
  return css.slice(start, end + 2);
}

describe('gameplay safe-area placement', () => {
  it('keeps Android controls at the viewport bottom and raises only iOS standalone controls', () => {
    expect(rule(':root')).toContain('--app-play-safe-bottom: 0px');
    expect(rule(':root.app-standalone')).not.toContain('--app-play-safe-bottom:');
    expect(rule(':root.app-ios-standalone')).toContain(
      '--app-play-safe-bottom: var(--app-dock-safe-bottom)',
    );
  });
});
