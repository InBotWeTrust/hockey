declare global {
  // Capacitor's native shell injects this marker before the React entrypoint runs.
  // `var` is required for a global declaration that is readable through globalThis.
  var __HOCKEY_NATIVE__: { platform: 'android' } | undefined;
  var Capacitor: { getPlatform?: () => string } | undefined;
}

export type RuntimePlatform = 'browser' | 'android';

const ANDROID_ORIGIN = 'https://ultimatehockey.ru';

export function getRuntimePlatform(): RuntimePlatform {
  return globalThis.__HOCKEY_NATIVE__?.platform === 'android' ||
    globalThis.Capacitor?.getPlatform?.() === 'android'
    ? 'android'
    : 'browser';
}

export function isNativeAndroid(): boolean {
  return getRuntimePlatform() === 'android';
}

export function getApiBaseUrl(): string {
  return isNativeAndroid() ? `${ANDROID_ORIGIN}/api` : '/api';
}

export function getWebSocketBaseUrl(): string {
  if (isNativeAndroid()) return 'wss://ultimatehockey.ru';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

export {};
