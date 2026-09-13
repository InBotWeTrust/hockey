import { afterEach, describe, expect, it } from 'vitest';
import {
  getApiBaseUrl,
  getRuntimePlatform,
  getWebSocketBaseUrl,
  isNativeAndroid,
} from './runtime.js';

function setNativeMarker(value: { platform: 'android' } | undefined): void {
  Object.defineProperty(globalThis, '__HOCKEY_NATIVE__', {
    configurable: true,
    value,
    writable: true,
  });
}

describe('runtime platform', () => {
  afterEach(() => {
    setNativeMarker(undefined);
    Reflect.deleteProperty(globalThis, 'Capacitor');
    window.history.replaceState({}, '', '/');
  });

  it('keeps browser API traffic same-origin', () => {
    setNativeMarker(undefined);

    expect(getRuntimePlatform()).toBe('browser');
    expect(isNativeAndroid()).toBe(false);
    expect(getApiBaseUrl()).toBe('/api');
  });

  it('uses the canonical production origins on Android', () => {
    setNativeMarker({ platform: 'android' });

    expect(getRuntimePlatform()).toBe('android');
    expect(isNativeAndroid()).toBe(true);
    expect(getApiBaseUrl()).toBe('https://ultimatehockey.ru/api');
    expect(getWebSocketBaseUrl()).toBe('wss://ultimatehockey.ru');
  });

  it('detects the Android shell from the bridge injected by Capacitor', () => {
    setNativeMarker(undefined);
    Object.defineProperty(globalThis, 'Capacitor', {
      configurable: true,
      value: { getPlatform: () => 'android' },
    });

    expect(getRuntimePlatform()).toBe('android');
    expect(getApiBaseUrl()).toBe('https://ultimatehockey.ru/api');
  });

  it('derives the browser WebSocket origin from the current page', () => {
    setNativeMarker(undefined);

    expect(getWebSocketBaseUrl()).toBe('ws://localhost:3000');
  });
});
