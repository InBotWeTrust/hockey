import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App.js';

const standaloneMedia = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
const fullscreenMedia = window.matchMedia?.('(display-mode: fullscreen)').matches ?? false;
const iosStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
if (standaloneMedia || fullscreenMedia || iosStandalone) {
  document.documentElement.classList.add('app-standalone');
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
