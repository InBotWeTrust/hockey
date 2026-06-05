import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App.js';

const LOCAL_DEV_CACHE_RESET_KEY = 'hockey.localDevCacheReset.v1';

function syncViewportHeight(): void {
  const height = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty('--app-viewport-height', `${height}px`);
}

syncViewportHeight();
window.visualViewport?.addEventListener('resize', syncViewportHeight);
window.addEventListener('resize', syncViewportHeight);
window.addEventListener('orientationchange', syncViewportHeight);

if (import.meta.env.DEV && window.location.hostname === '127.0.0.1') {
  void (async () => {
    if (window.sessionStorage.getItem(LOCAL_DEV_CACHE_RESET_KEY) === 'done') return;
    window.sessionStorage.setItem(LOCAL_DEV_CACHE_RESET_KEY, 'done');

    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ('caches' in window) {
      const keys = await window.caches.keys();
      await Promise.all(keys.map((key) => window.caches.delete(key)));
    }
    window.location.reload();
  })();
}

const standaloneMedia = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
const fullscreenMedia = window.matchMedia?.('(display-mode: fullscreen)').matches ?? false;
const iosStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
const iosLike =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
  iosStandalone;
if (iosLike) {
  document.documentElement.classList.add('app-ios');
}
if (standaloneMedia || fullscreenMedia || iosStandalone) {
  document.documentElement.classList.add('app-standalone');
}
if (iosStandalone || (iosLike && (standaloneMedia || fullscreenMedia))) {
  document.documentElement.classList.add('app-ios-standalone');
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
