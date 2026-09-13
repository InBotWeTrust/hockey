import { describe, expect, it } from 'vitest';
import { canAccessAndroidRelease } from './access.js';

describe('canAccessAndroidRelease', () => {
  it('allows only administrators', () => {
    expect(canAccessAndroidRelease('admin')).toBe(true);
    expect(canAccessAndroidRelease('player')).toBe(false);
    expect(canAccessAndroidRelease(undefined)).toBe(false);
  });
});
