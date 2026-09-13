import { isNativeAndroid } from '../platform/runtime.js';
import type { AuthSession } from './authStore.js';

const STORAGE_KEY = 'hockey.auth';

interface SecureSessionBridge {
  load(): Promise<{ value?: string }>;
  save(options: { value: string }): Promise<void>;
  clear(): Promise<void>;
}

function nativeBridge(): SecureSessionBridge {
  const capacitor = (globalThis as typeof globalThis & {
    Capacitor?: { Plugins?: { SecureSession?: SecureSessionBridge } };
  }).Capacitor;
  const bridge = capacitor?.Plugins?.SecureSession;
  if (!bridge) throw new Error('SecureSession native bridge is unavailable');
  return bridge;
}

function parseSession(value: string): AuthSession | null {
  const parsed = JSON.parse(value) as Partial<AuthSession>;
  if (
    typeof parsed.accessToken !== 'string' ||
    typeof parsed.refreshToken !== 'string' ||
    typeof parsed.user?.id !== 'string' ||
    typeof parsed.user.displayName !== 'string'
  ) {
    return null;
  }
  return parsed as AuthSession;
}

export const sessionStorage = {
  async load(): Promise<AuthSession | null> {
    if (isNativeAndroid()) {
      const bridge = nativeBridge();
      try {
        const { value } = await bridge.load();
        if (!value) return null;
        const session = parseSession(value);
        if (!session) await bridge.clear();
        return session;
      } catch {
        await bridge.clear().catch(() => undefined);
        return null;
      }
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const persisted = JSON.parse(raw) as { state?: Partial<AuthSession> };
      return parseSession(JSON.stringify(persisted.state));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  },

  async save(session: AuthSession): Promise<void> {
    if (isNativeAndroid()) {
      await nativeBridge().save({ value: JSON.stringify(session) });
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: session, version: 0 }));
  },

  async clear(): Promise<void> {
    if (isNativeAndroid()) {
      await nativeBridge().clear();
      return;
    }
    localStorage.removeItem(STORAGE_KEY);
  },
};
