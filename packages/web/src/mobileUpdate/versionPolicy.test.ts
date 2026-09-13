import { describe, expect, it } from 'vitest';
import { resolveUpdatePolicy } from './versionPolicy.js';

const manifest = { latestVersionCode: 5, minimumSupportedVersionCode: 3 };

describe('resolveUpdatePolicy', () => {
  it.each([
    [5, 'current'],
    [6, 'current'],
    [4, 'optional'],
    [3, 'optional'],
    [2, 'mandatory'],
  ] as const)('maps installed version %s to %s', (installed, expected) => {
    expect(resolveUpdatePolicy(installed, manifest)).toBe(expected);
  });

  it('rejects malformed version inputs', () => {
    expect(() => resolveUpdatePolicy(0, manifest)).toThrow();
    expect(() =>
      resolveUpdatePolicy(1, { latestVersionCode: 3, minimumSupportedVersionCode: 4 }),
    ).toThrow();
  });
});
