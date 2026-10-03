import { describe, expect, it } from 'vitest';
import { playoffSeriesLabel } from './playoffSeriesLabels.js';

describe('playoff series labels', () => {
  it.each([
    [2, ['1–2']],
    [4, ['1–4', '2–3']],
    [8, ['1–8', '4–5', '2–7', '3–6']],
    [16, ['1–16', '8–9', '4–13', '5–12', '2–15', '7–10', '3–14', '6–11']],
  ] as const)('labels the real seeded order for %i participants', (size, pairs) => {
    expect(pairs.map((_, index) => playoffSeriesLabel(size, 1, index + 1))).toEqual(
      pairs.map((pair, index) => `Серия ${index + 1} (${pair})`),
    );
  });

  it('labels later rounds by their two feeder series', () => {
    expect(playoffSeriesLabel(8, 2, 1)).toBe('Серия 1 (победители серий 1 и 2)');
    expect(playoffSeriesLabel(16, 2, 4)).toBe('Серия 4 (победители серий 7 и 8)');
    expect(playoffSeriesLabel(8, 3, 1)).toBe('Серия 1 (победители серий 1 и 2)');
  });
});
