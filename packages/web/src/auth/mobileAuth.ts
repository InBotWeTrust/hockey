import { apiFetch } from '../api/apiFetch.js';
import { isNativeAndroid } from '../platform/runtime.js';
import { useAuthStore, type AuthSession } from './authStore.js';
import { clearPendingReferralCode, referralAuthFields } from './referral.js';

export type MobileAuthProvider = 'telegram' | 'vk';

interface NativePlugins {
  SecureSession: {
    save(options: { value: string; slot?: string }): Promise<void>;
    load(options?: { slot?: string }): Promise<{ value?: string }>;
    clear(options?: { slot?: string }): Promise<void>;
  };
  Browser: {
    open(options: { url: string }): Promise<void>;
    close(): Promise<void>;
  };
  App?: {
    getLaunchUrl(): Promise<{ url?: string }>;
    addListener(
      event: 'appUrlOpen',
      callback: (event: { url: string }) => void,
    ): Promise<{ remove(): Promise<void> }>;
  };
}

function nativePlugins(): NativePlugins {
  const plugins = (
    globalThis as typeof globalThis & {
      Capacitor?: { Plugins?: Partial<NativePlugins> };
    }
  ).Capacitor?.Plugins;
  if (!plugins?.SecureSession || !plugins.Browser) {
    throw new Error('Native authentication bridge is unavailable');
  }
  return plugins as NativePlugins;
}

function randomVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(48));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  let binary = '';
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function startMobileAuth(provider: MobileAuthProvider): Promise<void> {
  if (!isNativeAndroid()) throw new Error('Mobile authentication requires Android');
  const plugins = nativePlugins();
  const codeVerifier = randomVerifier();
  const attempt = await apiFetch<{ attemptId: string; expiresAt: string }>('/mobile/auth/attempt', {
    method: 'POST',
    body: JSON.stringify({ provider, codeChallenge: await challenge(codeVerifier), ...referralAuthFields() }),
  });
  await plugins.SecureSession.save({
    slot: 'pendingAuth',
    value: JSON.stringify({ codeVerifier, attemptId: attempt.attemptId, provider }),
  });
  const url =
    provider === 'vk'
      ? `https://ultimatehockey.ru/api/mobile/auth/vk/start?attempt=${encodeURIComponent(attempt.attemptId)}`
      : `https://ultimatehockey.ru/mobile-auth/telegram?attempt=${encodeURIComponent(attempt.attemptId)}`;
  await plugins.Browser.open({ url });
}

function navigateTo(path = '/'): void {
  window.history.replaceState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export async function handleMobileAuthDeepLink(
  rawUrl: string,
  navigateHome: () => void = () => navigateTo('/'),
): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (
    url.origin !== 'https://ultimatehockey.ru' ||
    url.pathname !== '/mobile/auth/complete'
  ) {
    return false;
  }
  const authError = url.searchParams.get('error');
  if (authError === 'referral_code_invalid' && url.searchParams.getAll('error').length === 1) {
    const plugins = nativePlugins();
    clearPendingReferralCode();
    try { sessionStorage.setItem('hockey.mobileAuthError', 'Код приглашения не найден. Проверьте код или оставьте поле пустым.'); } catch { /* noop */ }
    await plugins.SecureSession.clear({ slot: 'pendingAuth' });
    await plugins.Browser.close().catch(() => undefined);
    navigateTo('/login');
    return true;
  }
  if (url.searchParams.getAll('code').length !== 1) return false;
  const handoffCode = url.searchParams.get('code');
  if (!handoffCode || !/^[A-Za-z0-9_-]{43}$/.test(handoffCode)) return false;

  const plugins = nativePlugins();
  const pendingResult = await plugins.SecureSession.load({ slot: 'pendingAuth' });
  if (!pendingResult.value) return false;
  let pending: { codeVerifier?: unknown };
  try {
    pending = JSON.parse(pendingResult.value) as { codeVerifier?: unknown };
  } catch {
    await plugins.SecureSession.clear({ slot: 'pendingAuth' });
    return false;
  }
  if (typeof pending.codeVerifier !== 'string') return false;

  const session = await apiFetch<AuthSession>('/mobile/auth/exchange', {
    method: 'POST',
    body: JSON.stringify({ handoffCode, codeVerifier: pending.codeVerifier }),
  });
  useAuthStore.getState().setSession(session);
  clearPendingReferralCode();
  await plugins.SecureSession.clear({ slot: 'pendingAuth' });
  await plugins.Browser.close().catch(() => undefined);
  navigateHome();
  return true;
}

export async function initializeMobileAuthDeepLinks(): Promise<void> {
  if (!isNativeAndroid()) return;
  const app = nativePlugins().App;
  if (!app) return;
  const launch = await app.getLaunchUrl();
  if (launch.url) await handleMobileAuthDeepLink(launch.url);
  await app.addListener('appUrlOpen', ({ url }) => {
    void handleMobileAuthDeepLink(url);
  });
}
