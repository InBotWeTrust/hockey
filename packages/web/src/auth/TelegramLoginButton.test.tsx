import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
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

  afterEach(() => {
    vi.useRealTimers();
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
    expect(screen.getByText('Вход через Telegram не настроен.')).toBeInTheDocument();
  });

  it('shows a VPN refresh fallback when the telegram script cannot load', () => {
    render(<TelegramLoginButton botUsername="test_bot" onAuth={() => {}} />);
    const container = screen.getByTestId('telegram-login-container');
    const script = container.querySelector('script')!;

    fireEvent.error(script);

    expect(screen.getByTestId('telegram-login-fallback')).toHaveTextContent(
      'Вход через Telegram доступен с VPN. Включите и обновите страницу.',
    );
    expect(screen.getByRole('button', { name: 'Обновить страницу' })).toBeInTheDocument();
    expect(container).toHaveStyle({ display: 'none' });
  });

  it('shows a VPN refresh fallback when the telegram widget does not render in time', () => {
    vi.useFakeTimers();
    render(<TelegramLoginButton botUsername="test_bot" onAuth={() => {}} />);

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByTestId('telegram-login-fallback')).toHaveTextContent(
      'Вход через Telegram доступен с VPN. Включите и обновите страницу.',
    );
  });

  it('keeps the telegram iframe hidden until it loads', async () => {
    vi.useFakeTimers();
    render(<TelegramLoginButton botUsername="test_bot" onAuth={() => {}} />);
    const container = screen.getByTestId('telegram-login-container');
    const frame = document.createElement('iframe');

    await act(async () => {
      container.appendChild(frame);
      await Promise.resolve();
    });

    expect(container).toHaveStyle({ visibility: 'hidden' });

    fireEvent.load(frame);

    expect(container).toHaveStyle({ visibility: 'visible' });

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByTestId('telegram-login-fallback')).not.toBeInTheDocument();
  });

  it('shows a VPN refresh fallback when the telegram iframe never loads', async () => {
    vi.useFakeTimers();
    render(<TelegramLoginButton botUsername="test_bot" onAuth={() => {}} />);
    const container = screen.getByTestId('telegram-login-container');
    const frame = document.createElement('iframe');

    await act(async () => {
      container.appendChild(frame);
      await Promise.resolve();
    });

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByTestId('telegram-login-fallback')).toHaveTextContent(
      'Вход через Telegram доступен с VPN. Включите и обновите страницу.',
    );
    expect(container).toHaveStyle({ display: 'none' });
  });

  it('shows a VPN refresh fallback when the telegram iframe reports an error', async () => {
    render(<TelegramLoginButton botUsername="test_bot" onAuth={() => {}} />);
    const container = screen.getByTestId('telegram-login-container');
    const frame = document.createElement('iframe');

    await act(async () => {
      container.appendChild(frame);
      await Promise.resolve();
    });

    fireEvent.error(frame);

    expect(screen.getByTestId('telegram-login-fallback')).toHaveTextContent(
      'Вход через Telegram доступен с VPN. Включите и обновите страницу.',
    );
    expect(container).toHaveStyle({ display: 'none' });
  });
});
