import { getTelegramMiniApp } from '../auth/telegramMiniApp.js';

export type FeedbackRuntime = 'telegram-mini-app' | 'standalone-pwa' | 'browser';
export type HapticKind = 'selection' | 'impact' | 'success' | 'warning' | 'error';

export interface HapticCapabilities {
  runtime: FeedbackRuntime;
  telegram: boolean;
  vibration: boolean;
}

const WEB_PATTERNS: Record<HapticKind, VibratePattern> = {
  selection: 8,
  impact: 15,
  success: [10, 35, 15],
  warning: [18, 35, 18],
  error: [25, 35, 25],
};

interface StandaloneNavigator extends Navigator {
  standalone?: boolean;
}

export function detectFeedbackRuntime(): FeedbackRuntime {
  if (getTelegramMiniApp() !== null) return 'telegram-mini-app';
  const displayModeStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = (window.navigator as StandaloneNavigator).standalone === true;
  const appMarkedStandalone = document.documentElement.classList.contains('app-standalone');
  return displayModeStandalone || iosStandalone || appMarkedStandalone
    ? 'standalone-pwa'
    : 'browser';
}

export function getHapticCapabilities(): HapticCapabilities {
  const runtime = detectFeedbackRuntime();
  const telegram = getTelegramMiniApp()?.HapticFeedback !== undefined;
  return {
    runtime,
    telegram,
    vibration: runtime !== 'telegram-mini-app' && typeof window.navigator.vibrate === 'function',
  };
}

export function triggerHaptic(kind: HapticKind): void {
  if (document.visibilityState === 'hidden') return;

  try {
    const webApp = getTelegramMiniApp();
    if (webApp !== null) {
      const haptics = webApp.HapticFeedback;
      if (haptics === undefined) return;
      if (kind === 'selection') {
        haptics.selectionChanged();
      } else if (kind === 'impact') {
        haptics.impactOccurred('light');
      } else {
        haptics.notificationOccurred(kind);
      }
      return;
    }

    window.navigator.vibrate?.(WEB_PATTERNS[kind]);
  } catch {
    // Haptics are progressive enhancement and must never block the user's action.
  }
}
