import { deleteAndroidPushInstallation, saveAndroidPushInstallation } from '../api/push.js';
import { isNativeAndroid } from './runtime.js';

const INSTALLATION_ID_KEY = 'android_push_installation_id';
const PUSH_ENABLED_KEY = 'android_push_enabled';

export type NativePushPermissionStatus = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied';

interface ListenerHandle {
  remove(): Promise<void>;
}

interface NativePushPlugins {
  PushNotifications: {
    checkPermissions(): Promise<{ receive: NativePushPermissionStatus }>;
    requestPermissions(): Promise<{ receive: NativePushPermissionStatus }>;
    register(): Promise<void>;
    addListener(
      event: 'registration',
      callback: (token: { value: string }) => void,
    ): Promise<ListenerHandle>;
    addListener(
      event: 'registrationError',
      callback: (error: unknown) => void,
    ): Promise<ListenerHandle>;
  };
  Preferences: {
    get(options: { key: string }): Promise<{ value?: string | null }>;
    set(options: { key: string; value: string }): Promise<void>;
  };
  App: {
    getInfo(): Promise<{ build: string }>;
  };
}

function plugins(): NativePushPlugins {
  const value = (
    globalThis as typeof globalThis & {
      Capacitor?: { Plugins?: Partial<NativePushPlugins> };
    }
  ).Capacitor?.Plugins;
  if (!value?.PushNotifications || !value.Preferences || !value.App) {
    throw new Error('Native push bridge is unavailable');
  }
  return value as NativePushPlugins;
}

async function installationId(): Promise<string> {
  const preferences = plugins().Preferences;
  const existing = await preferences.get({ key: INSTALLATION_ID_KEY });
  if (existing.value && /^[0-9a-f-]{36}$/i.test(existing.value)) return existing.value;
  const created = crypto.randomUUID();
  await preferences.set({ key: INSTALLATION_ID_KEY, value: created });
  return created;
}

async function saveToken(token: string): Promise<void> {
  const native = plugins();
  const [id, info] = await Promise.all([installationId(), native.App.getInfo()]);
  const appVersionCode = Number.parseInt(info.build, 10);
  if (!Number.isSafeInteger(appVersionCode) || appVersionCode < 1) {
    throw new Error('Invalid Android app version code');
  }
  await saveAndroidPushInstallation(id, token, appVersionCode);
}

async function registerForToken(): Promise<string> {
  const push = plugins().PushNotifications;
  let resolveToken!: (token: string) => void;
  let rejectToken!: (error: unknown) => void;
  const tokenPromise = new Promise<string>((resolve, reject) => {
    resolveToken = resolve;
    rejectToken = reject;
  });
  const [registrationHandle, errorHandle] = await Promise.all([
    push.addListener('registration', ({ value }) => resolveToken(value)),
    push.addListener('registrationError', rejectToken),
  ]);
  let timeoutId: number | undefined;
  try {
    await push.register();
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error('FCM registration timed out')), 15_000);
    });
    return await Promise.race([tokenPromise, timeout]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    await Promise.all([registrationHandle.remove(), errorHandle.remove()]);
  }
}

export const nativePush = {
  async getStatus(): Promise<{ status: NativePushPermissionStatus }> {
    if (!isNativeAndroid()) return { status: 'denied' };
    const native = plugins();
    const [permission, enabled] = await Promise.all([
      native.PushNotifications.checkPermissions(),
      native.Preferences.get({ key: PUSH_ENABLED_KEY }),
    ]);
    if (permission.receive === 'granted' && enabled.value !== 'true') {
      return { status: 'prompt' };
    }
    return { status: permission.receive };
  },

  async subscribe(): Promise<{ status: NativePushPermissionStatus }> {
    if (!isNativeAndroid()) return { status: 'denied' };
    const push = plugins().PushNotifications;
    const current = await push.checkPermissions();
    const permission = current.receive === 'granted' ? current : await push.requestPermissions();
    if (permission.receive !== 'granted') return { status: permission.receive };

    const token = await registerForToken();
    await saveToken(token);
    await plugins().Preferences.set({ key: PUSH_ENABLED_KEY, value: 'true' });
    return { status: 'granted' };
  },

  async unsubscribe(): Promise<void> {
    if (!isNativeAndroid()) return;
    await plugins().Preferences.set({ key: PUSH_ENABLED_KEY, value: 'false' });
    await deleteAndroidPushInstallation(await installationId());
  },

  async addTokenRefreshListener(): Promise<ListenerHandle> {
    const native = plugins();
    const handle = await native.PushNotifications.addListener('registration', ({ value }) => {
      void plugins()
        .Preferences.get({ key: PUSH_ENABLED_KEY })
        .then(({ value: enabled }) => (enabled === 'true' ? saveToken(value) : undefined))
        .catch(() => undefined);
    });
    const enabled = await native.Preferences.get({ key: PUSH_ENABLED_KEY });
    if (enabled.value === 'true') await native.PushNotifications.register();
    return handle;
  },
};
