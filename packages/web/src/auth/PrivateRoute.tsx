import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './authStore.js';
import { useTelegramMiniAppAuth } from './useTelegramMiniAppAuth.js';

export function PrivateRoute({ children }: { children: ReactNode }): JSX.Element {
  const isAuth = useAuthStore((s) => Boolean(s.accessToken));
  const miniAppAuth = useTelegramMiniAppAuth();
  const location = useLocation();
  if (!isAuth) {
    if (miniAppAuth.isTelegramMiniApp) {
      return (
        <main className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>
            {miniAppAuth.isError ? 'Не удалось войти через Telegram' : 'Входим через Telegram...'}
          </div>
        </main>
      );
    }
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}
