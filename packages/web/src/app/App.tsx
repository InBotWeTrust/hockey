import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import './global.css';
import './design-system.css';
import { DailyScreen, DemoScreen } from '../screens/DailyScreen.js';
import { InventoryScreen } from '../screens/InventoryScreen.js';
import { LoginScreen } from '../screens/LoginScreen.js';
import { ProfileScreen } from '../screens/ProfileScreen.js';
import { ProfileSettingsScreen } from '../screens/ProfileSettingsScreen.js';
import { SectionsScreen } from '../screens/SectionsScreen.js';
import { TestCourtScreen } from '../screens/TestCourtScreen.js';
import { VkAuthCallbackScreen } from '../screens/VkAuthCallbackScreen.js';
import { PrivateRoute } from '../auth/PrivateRoute.js';
import { useAuthStore } from '../auth/authStore.js';
import { BottomNav, isBottomNavVisible } from '../components/BottomNav.js';
import { UpdatePrompt } from '../components/UpdatePrompt.js';
import { AdminScreen } from '../admin/AdminScreen.js';
import { OfflineBanner } from '../chat/components/OfflineBanner.js';
import { ChatListScreen } from '../chat/screens/ChatListScreen.js';
import { ChatRoomScreen } from '../chat/screens/ChatRoomScreen.js';
import { ChatInfoScreen } from '../chat/screens/ChatInfoScreen.js';
import { ChannelPostCommentsScreen } from '../chat/screens/ChannelPostCommentsScreen.js';
import { UserProfileScreen } from '../chat/screens/UserProfileScreen.js';
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

function AppFrame(): JSX.Element {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const bottomNavVisible = isBottomNavVisible(location, user);

  return (
    <>
      <ChatRealtime />
      <div
        className={`app-shell${bottomNavVisible ? ' app-shell--bottom-nav-visible' : ''}`}
        style={{
          maxWidth: 430,
          margin: '0 auto',
          width: '100%',
          height: '100dvh',
          minHeight: '100dvh',
          position: 'relative',
          transform: 'translateZ(0)',
          overflow: 'hidden',
          background: 'linear-gradient(180deg, var(--app-bg-top) 0%, var(--app-bg-bottom) 100%)',
          boxShadow: '0 0 0 1px rgba(15,23,42,0.08), 0 8px 48px rgba(15,23,42,0.14)',
        }}
      >
        <div className="app-content">
          <Routes>
            <Route path="/login" element={<LoginScreen />} />
            <Route path="/demo" element={<DemoScreen />} />
            <Route path="/auth/vk/callback" element={<VkAuthCallbackScreen />} />
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
              path="/sections"
              element={
                <PrivateRoute>
                  <SectionsScreen />
                </PrivateRoute>
              }
            />
            <Route
              path="/inventory"
              element={
                <PrivateRoute>
                  <InventoryScreen />
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
              path="/profile/settings"
              element={
                <PrivateRoute>
                  <ProfileSettingsScreen />
                </PrivateRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <PrivateRoute>
                  <AdminScreen />
                </PrivateRoute>
              }
            />
            <Route
              path="/test-court"
              element={<TestCourtScreen />}
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
            <Route
              path="/chat/:chatId/info"
              element={
                <PrivateRoute>
                  <ChatInfoScreen />
                </PrivateRoute>
              }
            />
            <Route
              path="/chat/:chatId/posts/:postId/comments"
              element={
                <PrivateRoute>
                  <ChannelPostCommentsScreen />
                </PrivateRoute>
              }
            />
            <Route
              path="/users/:userId"
              element={
                <PrivateRoute>
                  <UserProfileScreen />
                </PrivateRoute>
              }
            />
          </Routes>
        </div>
        <BottomNav />
      </div>
      <UpdatePrompt />
    </>
  );
}

export function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppFrame />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
