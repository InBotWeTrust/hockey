import { describe, expect, it } from 'vitest';
import { calculateColumnLayout } from './columnLayout.js';
const layout = (width: number, pageCount = 6, dockedChat = false, selectedIndex = 0) =>
  calculateColumnLayout({ width, pageCount, dockedChat, selectedIndex });
describe('responsive column geometry', () => {
  it.each([
    [430, 1],
    [831, 1],
    [832, 2],
    [1235, 2],
    [1236, 3],
    [1920, 3],
  ])('uses available width %i for %i columns', (width, count) => {
    expect(layout(width).count).toBe(count);
  });
  it('reserves pinned chat once and limits columns to the page count', () => {
    expect(layout(1440, 3, true).count).toBe(2);
    expect(layout(1920, 2).count).toBe(2);
    expect(layout(1920, 1).columnWidth).toBe(430);
  });
  it('keeps the selected page visible after shrinking', () => {
    const wide = layout(1440, 6, false, 5),
      narrow = layout(834, 6, false, 5),
      mobile = layout(390, 6, false, 5);
    expect(wide.firstIndex).toBe(3);
    expect(narrow.firstIndex).toBe(4);
    expect(mobile.firstIndex).toBe(5);
  });
  it('handles initial measurements, invalid indices and empty collections', () => {
    for (const width of [0, -1, Number.NaN]) {
      const result = layout(width, 0, false, -10);
      expect(result.count).toBe(1);
      expect(result.columnWidth).toBeGreaterThanOrEqual(0);
      expect(result.firstIndex).toBe(0);
    }
    expect(layout(390).columnWidth).toBe(390);
  });
});
