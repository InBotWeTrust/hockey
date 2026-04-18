import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TelegramLoginButton } from './TelegramLoginButton.js';

type AuthCallback = (payload: Record<string, unknown>) => void;
type WindowWithCallbacks = typeof window & Record<string, AuthCallback | undefined>;

describe('TelegramLoginButton', () => {
  beforeEach(() => {
    const w = window as WindowWithCallbacks;
    Object.keys(w)
      .filter((k) => k.startsWith('onTelegramAuth'))
      .forEach((k) => {
        w[k] = undefined;
      });
  });

  it('renders a container with the telegram script attributes', () => {
    render(<TelegramLoginButton botUsername="test_bot" onAuth={() => {}} />);
    const container = screen.getByTestId('telegram-login-container');
    const script = container.querySelector('script');
    expect(script).not.toBeNull();
    expect(script!.getAttribute('data-telegram-login')).toBe('test_bot');
    expect(script!.getAttribute('data-request-access')).toBe('write');
    expect(script!.getAttribute('data-onauth')).toMatch(/^onTelegramAuth/);
    expect(script!.getAttribute('src')).toContain('telegram.org/js/telegram-widget.js');
  });

  it('invokes onAuth when global callback fires', () => {
    const onAuth = vi.fn();
    render(<TelegramLoginButton botUsername="test_bot" onAuth={onAuth} />);
    const script = screen.getByTestId('telegram-login-container').querySelector('script')!;
    const cbName = script.getAttribute('data-onauth')!.replace('(user)', '');
    const w = window as WindowWithCallbacks;
    const cb = w[cbName];
    expect(cb).toBeTypeOf('function');
    cb!({ id: 42, first_name: 'Alice', auth_date: 1, hash: 'x' });
    expect(onAuth).toHaveBeenCalledWith({
      id: 42,
      first_name: 'Alice',
      auth_date: 1,
      hash: 'x',
    });
  });

  it('renders fallback when botUsername is empty', () => {
    render(<TelegramLoginButton botUsername="" onAuth={() => {}} />);
    expect(screen.getByText(/login is not configured/i)).toBeInTheDocument();
  });
});
