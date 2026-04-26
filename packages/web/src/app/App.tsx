import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './global.css';
import './design-system.css';
import { DailyScreen } from '../screens/DailyScreen.js';
import { LoginScreen } from '../screens/LoginScreen.js';
import { ProfileScreen } from '../screens/ProfileScreen.js';
import { PrivateRoute } from '../auth/PrivateRoute.js';
import { BottomNav } from '../components/BottomNav.js';
import { UpdatePrompt } from '../components/UpdatePrompt.js';
import { OfflineBanner } from '../chat/components/OfflineBanner.js';
import { ChatListScreen } from '../chat/screens/ChatListScreen.js';
import { ChatRoomScreen } from '../chat/screens/ChatRoomScreen.js';
import { useChatSocket } from '../chat/useChatSocket.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

function ChatRealtime(): JSX.Element {
  const status = useChatSocket();
  return <OfflineBanner status={status} />;
}

export function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ChatRealtime />
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
            boxShadow: '0 0 0 1px rgba(15,23,42,0.08), 0 8px 48px rgba(15,23,42,0.14)',
          }}
        >
          <Routes>
            <Route path="/login" element={<LoginScreen />} />
            <Route
              path="/"
              element={
                <PrivateRoute>
                  <DailyScreen />
                </PrivateRoute>
              }
            />
            <Route
              path="/duel/:goalieId"
              element={
                <PrivateRoute>
                  <DailyScreen />
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
            <Route
              path="/chat"
              element={
                <PrivateRoute>
                  <ChatListScreen />
                </PrivateRoute>
              }
            />
            <Route path="/chat/new" element={<Navigate to="/chat?new=1" replace />} />
            <Route
              path="/chat/:chatId"
              element={
                <PrivateRoute>
                  <ChatRoomScreen />
                </PrivateRoute>
              }
            />
          </Routes>
          <BottomNav />
          <UpdatePrompt />
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
