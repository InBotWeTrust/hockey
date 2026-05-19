import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App.js';

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
