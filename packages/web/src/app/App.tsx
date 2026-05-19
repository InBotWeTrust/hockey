import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import './global.css';
import './design-system.css';
import { LoginScreen } from '../screens/LoginScreen.js';
import { PrivateRoute } from '../auth/PrivateRoute.js';
import { useAuthStore } from '../auth/authStore.js';
import { BottomNav, isBottomNavVisible } from '../components/BottomNav.js';
import { UpdatePrompt } from '../components/UpdatePrompt.js';
import { OfflineBanner } from '../chat/components/OfflineBanner.js';
import { useChatSocket } from '../chat/useChatSocket.js';

const DailyScreen = lazy(() =>
  import('../screens/DailyScreen.js').then((module) => ({ default: module.DailyScreen })),
);
const DemoScreen = lazy(() =>
  import('../screens/DailyScreen.js').then((module) => ({ default: module.DemoScreen })),
);
const InventoryScreen = lazy(() =>
  import('../screens/InventoryScreen.js').then((module) => ({ default: module.InventoryScreen })),
);
const ProfileScreen = lazy(() =>
  import('../screens/ProfileScreen.js').then((module) => ({ default: module.ProfileScreen })),
);
const ProfileSettingsScreen = lazy(() =>
  import('../screens/ProfileSettingsScreen.js').then((module) => ({
    default: module.ProfileSettingsScreen,
  })),
);
const SectionsScreen = lazy(() =>
  import('../screens/SectionsScreen.js').then((module) => ({ default: module.SectionsScreen })),
);
const TestCourtScreen = lazy(() =>
  import('../screens/TestCourtScreen.js').then((module) => ({ default: module.TestCourtScreen })),
);
const VkAuthCallbackScreen = lazy(() =>
  import('../screens/VkAuthCallbackScreen.js').then((module) => ({
    default: module.VkAuthCallbackScreen,
  })),
);
const AdminScreen = lazy(() =>
  import('../admin/AdminScreen.js').then((module) => ({ default: module.AdminScreen })),
);
const ChatListScreen = lazy(() =>
  import('../chat/screens/ChatListScreen.js').then((module) => ({
    default: module.ChatListScreen,
  })),
);
const ChatRoomScreen = lazy(() =>
  import('../chat/screens/ChatRoomScreen.js').then((module) => ({
    default: module.ChatRoomScreen,
  })),
);
const ChatInfoScreen = lazy(() =>
  import('../chat/screens/ChatInfoScreen.js').then((module) => ({
    default: module.ChatInfoScreen,
  })),
);
const ChannelPostCommentsScreen = lazy(() =>
  import('../chat/screens/ChannelPostCommentsScreen.js').then((module) => ({
    default: module.ChannelPostCommentsScreen,
  })),
);
const UserProfileScreen = lazy(() =>
  import('../chat/screens/UserProfileScreen.js').then((module) => ({
    default: module.UserProfileScreen,
  })),
);

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

function RouteLoading(): JSX.Element {
  return (
    <main className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--muted)', fontSize: 14 }}>Загрузка…</div>
    </main>
  );
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
          <Suspense fallback={<RouteLoading />}>
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
              <Route path="/test-court" element={<TestCourtScreen />} />
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
          </Suspense>
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
