import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { DuelScreen } from '../screens/DuelScreen.js';
import { GoalieListScreen } from '../screens/GoalieListScreen.js';
import { LoginScreen } from '../screens/LoginScreen.js';
import { PrivateRoute } from '../auth/PrivateRoute.js';
import { AppHeader } from './AppHeader.js';

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
        <AppHeader />
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <GoalieListScreen />
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
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
