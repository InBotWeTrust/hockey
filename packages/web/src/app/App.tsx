import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './global.css';
import './design-system.css';
import { DuelScreen } from '../screens/DuelScreen.js';
import { LoginScreen } from '../screens/LoginScreen.js';
import { ProfileScreen } from '../screens/ProfileScreen.js';
import { PrivateRoute } from '../auth/PrivateRoute.js';
import { BottomNav } from '../components/BottomNav.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

export function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div
          className="app-shell"
          style={{
            maxWidth: 430,
            margin: '0 auto',
            minHeight: '100dvh',
            position: 'relative',
            transform: 'translateZ(0)',
            overflow: 'hidden',
            paddingTop: 'env(safe-area-inset-top, 0px)',
            boxShadow: '0 0 60px rgba(0, 0, 0, 0.6)',
          }}
        >
          <Routes>
            <Route path="/login" element={<LoginScreen />} />
            <Route
              path="/"
              element={
                <PrivateRoute>
                  <DuelScreen />
                </PrivateRoute>
              }
            />
            <Route
              path="/duel/:goalieId"
              element={
                <PrivateRoute>
                  <DuelScreen />
                </PrivateRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <PrivateRoute>
                  <ProfileScreen />
                </PrivateRoute>
              }
            />
          </Routes>
          <BottomNav />
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
