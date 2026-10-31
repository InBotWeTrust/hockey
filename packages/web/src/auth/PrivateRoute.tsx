import {useFunnelActivity} from '../analytics/noviceFunnel.js';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './authStore.js';

export function PrivateRoute({ children }: { children: ReactNode }): JSX.Element {
  const isAuth = useAuthStore((s) => Boolean(s.accessToken));
  const location = useLocation();
  useFunnelActivity(isAuth);
  if (!isAuth) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }
  return <>{children}</>;
}
