import { useAuthStore } from '../auth/authStore.js';
import { canAccessAndroidRelease } from '../mobileUpdate/access.js';

export function AdminAndroidReleaseOnly({
  children,
}: {
  children: JSX.Element;
}): JSX.Element | null {
  const allowed = useAuthStore((state) => canAccessAndroidRelease(state.user?.role));
  return allowed ? children : null;
}
