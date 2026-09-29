import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './clipboard.js';

describe('copyText', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('uses the asynchronous clipboard API when it succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    await expect(copyText('TEAM-77')).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith('TEAM-77');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('falls back to a selected temporary textarea when the clipboard API rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const execCommand = vi.fn().mockImplementation(() => {
      const textarea = document.querySelector('textarea');
      expect(textarea).toHaveValue('https://example.test/invite/TEAM-77');
      expect(textarea).toHaveAttribute('readonly');
      expect(document.activeElement).toBe(textarea);
      return true;
    });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });

    await expect(copyText('https://example.test/invite/TEAM-77')).resolves.toBe(true);

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });
});
