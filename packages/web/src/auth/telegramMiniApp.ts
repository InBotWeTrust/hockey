export interface TelegramMiniAppWebApp {
  initData?: string;
  ready?: () => void;
  expand?: () => void;
}

interface TelegramMiniAppWindow extends Window {
  Telegram?: {
    WebApp?: TelegramMiniAppWebApp;
  };
}

const TELEGRAM_WEB_APP_SCRIPT_SRC = 'https://telegram.org/js/telegram-web-app.js?62';
const TELEGRAM_WEB_APP_SCRIPT_TIMEOUT_MS = 5000;

let telegramScriptPromise: Promise<TelegramMiniAppWebApp | null> | null = null;

export function getTelegramMiniApp(): TelegramMiniAppWebApp | null {
  if (typeof window === 'undefined') return null;
  const webApp = (window as TelegramMiniAppWindow).Telegram?.WebApp;
  if (!webApp?.initData) return null;
  return webApp;
}

function hasTelegramLaunchParam(params: URLSearchParams): boolean {
  return params.has('tgWebAppData') || params.has('tgWebAppVersion');
}

export function hasTelegramMiniAppLaunchParams(): boolean {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  return (
    hasTelegramLaunchParam(new URLSearchParams(window.location.search)) ||
    hasTelegramLaunchParam(new URLSearchParams(hash))
  );
}

export function isTelegramMiniAppLaunch(): boolean {
  return getTelegramMiniApp() !== null || hasTelegramMiniAppLaunchParams();
}

export function loadTelegramMiniAppScript(
  timeoutMs = TELEGRAM_WEB_APP_SCRIPT_TIMEOUT_MS,
): Promise<TelegramMiniAppWebApp | null> {
  const existingWebApp = getTelegramMiniApp();
  if (existingWebApp) return Promise.resolve(existingWebApp);
  if (!hasTelegramMiniAppLaunchParams()) return Promise.resolve(null);
  if (telegramScriptPromise) return telegramScriptPromise;

  telegramScriptPromise = new Promise<TelegramMiniAppWebApp | null>((resolve) => {
    const script =
      document.querySelector<HTMLScriptElement>('script[data-telegram-web-app="true"]') ??
      document.createElement('script');

    let settled = false;
    let timeoutId: number | null = null;

    const finish = (webApp: TelegramMiniAppWebApp | null): void => {
      if (settled) return;
      settled = true;
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      resolve(webApp);
    };

    const handleLoad = (): void => finish(getTelegramMiniApp());
    const handleError = (): void => finish(null);

    script.addEventListener('load', handleLoad);
    script.addEventListener('error', handleError);
    timeoutId = window.setTimeout(() => finish(null), timeoutMs);

    if (!script.parentElement) {
      script.dataset.telegramWebApp = 'true';
      script.src = TELEGRAM_WEB_APP_SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return telegramScriptPromise;
}
