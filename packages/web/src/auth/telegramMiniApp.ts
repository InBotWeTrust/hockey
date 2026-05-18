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

export function getTelegramMiniApp(): TelegramMiniAppWebApp | null {
  if (typeof window === 'undefined') return null;
  const webApp = (window as TelegramMiniAppWindow).Telegram?.WebApp;
  if (!webApp?.initData) return null;
  return webApp;
}
