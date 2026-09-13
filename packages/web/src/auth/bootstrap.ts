import { initializeAuthSession } from './authStore.js';
import { initializeMobileAuthDeepLinks } from './mobileAuth.js';
import { isNativeAndroid } from '../platform/runtime.js';
import { nativePush } from '../platform/push.js';

async function initializeNativePushListener(): Promise<void> {
  if (!isNativeAndroid()) return;
  await nativePush.addTokenRefreshListener();
}

export async function initializeApplicationAuth(
  hydrateSession: () => Promise<void> = initializeAuthSession,
  initializeDeepLinks: () => Promise<void> = initializeMobileAuthDeepLinks,
  reportError: (error: unknown) => void = console.error,
  initializePushListener: () => Promise<void> = initializeNativePushListener,
): Promise<void> {
  await hydrateSession();
  try {
    await initializeDeepLinks();
  } catch (error) {
    reportError(error);
  }
  try {
    await initializePushListener();
  } catch (error) {
    reportError(error);
  }
}
