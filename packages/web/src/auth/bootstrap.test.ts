import { describe, expect, it, vi } from 'vitest';
import { initializeApplicationAuth } from './bootstrap.js';

describe('initializeApplicationAuth', () => {
  it('hydrates the protected session before consuming an Android auth deep link', async () => {
    const calls: string[] = [];
    await initializeApplicationAuth(
      async () => {
        calls.push('session');
      },
      async () => {
        calls.push('deep-link');
      },
    );

    expect(calls).toEqual(['session', 'deep-link']);
  });

  it('does not prevent startup when deep-link initialization fails', async () => {
    const report = vi.fn();

    await expect(
      initializeApplicationAuth(
        async () => undefined,
        async () => {
          throw new Error('native bridge failed');
        },
        report,
      ),
    ).resolves.toBeUndefined();
    expect(report).toHaveBeenCalledOnce();
  });
});
