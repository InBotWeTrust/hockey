import { describe, expect, it } from 'vitest';
import { isMarksmanshipConstructorEnabled } from './devOnlyFeatures.js';

describe('marksmanship constructor release gate', () => {
  it('is disabled without the exact development sentinel', () => {
    expect(isMarksmanshipConstructorEnabled(undefined)).toBe(false);
    expect(isMarksmanshipConstructorEnabled('true')).toBe(false);
    expect(isMarksmanshipConstructorEnabled('')).toBe(false);
  });

  it('enables only the explicit development build', () => {
    expect(isMarksmanshipConstructorEnabled('dev-only-enabled')).toBe(true);
  });
});
