import { initializeAuthSession } from './authStore.js';
import { initializeMobileAuthDeepLinks } from './mobileAuth.js';

export async function initializeApplicationAuth(
  hydrateSession: () => Promise<void> = initializeAuthSession,
  initializeDeepLinks: () => Promise<void> = initializeMobileAuthDeepLinks,
  reportError: (error: unknown) => void = console.error,
): Promise<void> {
  await hydrateSession();
  try {
    await initializeDeepLinks();
  } catch (error) {
    reportError(error);
  }
}
