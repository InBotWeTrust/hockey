import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getHapticCapabilities, triggerHaptic } from './haptics.js';

interface TelegramWindow extends Window {
  Telegram?: {
    WebApp?: {
      initData?: string;
      HapticFeedback?: {
        selectionChanged: () => void;
        impactOccurred: (style: string) => void;
        notificationOccurred: (type: string) => void;
      };
    };
  };
}

type TestTelegramWebApp = NonNullable<TelegramWindow['Telegram']>['WebApp'];

function setTelegramWebApp(webApp: TestTelegramWebApp | undefined): void {
  Object.defineProperty(window, 'Telegram', {
    configurable: true,
    value: webApp ? { WebApp: webApp } : undefined,
  });
}

function setVibrate(vibrate: ((pattern: VibratePattern) => boolean) | undefined): void {
  Object.defineProperty(window.navigator, 'vibrate', {
    configurable: true,
    value: vibrate,
  });
}

describe('platform haptics', () => {
  beforeEach(() => {
    setTelegramWebApp(undefined);
    setVibrate(undefined);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses Telegram semantic haptics without also vibrating the web runtime', () => {
    const selectionChanged = vi.fn();
    const impactOccurred = vi.fn();
    const notificationOccurred = vi.fn();
    const vibrate = vi.fn(() => true);
    setTelegramWebApp({
      initData: 'signed-data',
      HapticFeedback: { selectionChanged, impactOccurred, notificationOccurred },
    });
    setVibrate(vibrate);

    triggerHaptic('selection');
    triggerHaptic('impact');
    triggerHaptic('success');
    triggerHaptic('warning');
    triggerHaptic('error');

    expect(selectionChanged).toHaveBeenCalledTimes(1);
    expect(impactOccurred).toHaveBeenCalledWith('light');
    expect(notificationOccurred.mock.calls).toEqual([['success'], ['warning'], ['error']]);
    expect(vibrate).not.toHaveBeenCalled();
    expect(getHapticCapabilities()).toEqual({
      runtime: 'telegram-mini-app',
      telegram: true,
      vibration: false,
    });
  });

  it('does not fall back to navigator.vibrate inside an old Telegram runtime', () => {
    const vibrate = vi.fn(() => true);
    setTelegramWebApp({ initData: 'signed-data' });
    setVibrate(vibrate);

    triggerHaptic('success');

    expect(vibrate).not.toHaveBeenCalled();
    expect(getHapticCapabilities().runtime).toBe('telegram-mini-app');
    expect(getHapticCapabilities().telegram).toBe(false);
  });

  it('maps semantic feedback to restrained web vibration patterns', () => {
    const vibrate = vi.fn(() => true);
    setVibrate(vibrate);

    triggerHaptic('selection');
    triggerHaptic('impact');
    triggerHaptic('success');
    triggerHaptic('warning');
    triggerHaptic('error');

    expect(vibrate.mock.calls).toEqual([[8], [15], [[10, 35, 15]], [[18, 35, 18]], [[25, 35, 25]]]);
  });

  it('is a safe no-op without platform support or while the document is hidden', () => {
    expect(() => triggerHaptic('error')).not.toThrow();

    const vibrate = vi.fn(() => {
      throw new Error('blocked');
    });
    setVibrate(vibrate);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });

    expect(() => triggerHaptic('error')).not.toThrow();
    expect(vibrate).not.toHaveBeenCalled();
  });
});
