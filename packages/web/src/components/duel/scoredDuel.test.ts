import { describe, expect, it } from 'vitest';
import { duelDisplayScore, duelFormatLabel } from './scoredDuel.js';
describe('scored duel presentation', () => {
  it('keeps raw goals separate from format points and penalties', () => {
    expect(duelDisplayScore('sniper', { goals: 3, format_score: 5.2 })).toBe(5.2);
    expect(duelDisplayScore('marathon', { goals: 9, format_score: 2 })).toBe(2);
    expect(duelDisplayScore('classic', { goals: 3, format_score: 5 })).toBe(3);
  });
  it('makes the invited Marathon variant visible', () => {
    expect(duelFormatLabel({ duelKind: 'marathon', marathonWindowMs: 4000 })).toBe(
      'Марафон · 4 сек',
    );
    expect(duelFormatLabel({ duelKind: 'sniper' })).toBe('Снайпер');
  });
});
