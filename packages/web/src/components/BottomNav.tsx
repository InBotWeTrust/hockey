import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Gamepad2, MessageCircle, Package, ShieldCheck, User } from 'lucide-react';
import { apiFetch } from '../api/apiFetch.js';
import { useAuthStore } from '../auth/authStore.js';
import type { AuthUser } from '../auth/authStore.js';
import { fetchUnreadCounts } from '../chat/api.js';
import { useChatStore } from '../chat/chatStore.js';
import { chatKeys } from '../lib/queryKeys.js';

export const NAV_HEIGHT = 68;

const ICON_SIZE = 22;
const LAST_GAME_ROUTE_KEY = 'hockey.nav.lastGameRoute';
const LAST_CHAT_ROUTE_KEY = 'hockey.nav.lastChatRoute';
const DEFAULT_GAME_ROUTE = '/?view=arena';
const DEFAULT_CHAT_ROUTE = '/chat';
export const ADMIN_NAV_HOME_EVENT = 'hockey:admin-nav-home';

function routeFromLocation(location: ReturnType<typeof useLocation>): string {
  return `${location.pathname}${location.search}${location.hash}`;
}

function isGameRoute(pathname: string): boolean {
  return pathname === '/' || pathname.startsWith('/duel');
}

function isChatRoute(pathname: string): boolean {
  return pathname.startsWith('/chat');
}

function isSectionContext(location: ReturnType<typeof useLocation>): boolean {
  if (location.pathname.startsWith('/sections') || location.pathname.startsWith('/inventory')) {
    return true;
  }
  if (location.pathname !== '/') return false;
  const params = new URLSearchParams(location.search);
  if (params.get('from') !== 'sections') return false;
  if (params.get('play') === '1' || params.has('match')) return false;
  const view = params.get('view');
  return view === 'training' || view === 'amateur' || view === 'pro';
}

function readRememberedRoute(key: string, fallback: string): string {
  try {
    return window.sessionStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function rememberRoute(key: string, route: string): void {
  try {
    window.sessionStorage.setItem(key, route);
  } catch {
    // Session storage can be blocked in some embedded browsers; navigation still works with defaults.
  }
}

type NavLocation = Pick<Location, 'pathname' | 'search'>;

function normalizeNavLocation(location: string | NavLocation): NavLocation {
  return typeof location === 'string' ? { pathname: location, search: '' } : location;
}

function isOpenRinkRoute(location: NavLocation): boolean {
  if (location.pathname !== '/') return false;
  const params = new URLSearchParams(location.search);
  const view = params.get('view');
  if (view === 'daily') return true;
  if (view === 'training' && params.get('play') === '1') return true;
  return view === 'amateur' && params.has('match') && params.get('play') === '1';
}

export function isBottomNavVisible(location: string | NavLocation, user: AuthUser | null): boolean {
  const { pathname } = normalizeNavLocation(location);
  const isDemo = pathname === '/demo';
  const isInChatRoom = /^\/chat\/[^/]+(?:\/posts\/[^/]+\/comments)?$/.test(pathname);
  return (
    pathname !== '/login' &&
    !isInChatRoom &&
    !isOpenRinkRoute(normalizeNavLocation(location)) &&
    (Boolean(user) || isDemo)
  );
}

export function BottomNav(): JSX.Element | null {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const location = useLocation();
  const navigate = useNavigate();
  const isDemo = location.pathname === '/demo';
  const lastChatRouteRef = useRef(readRememberedRoute(LAST_CHAT_ROUTE_KEY, DEFAULT_CHAT_ROUTE));

  const totalUnread = useChatStore((s) => s.totalUnread());
  const setUnread = useChatStore((s) => s.setUnread);

  const { data: unreadMap } = useQuery<Record<string, number>>({
    queryKey: chatKeys.unread(),
    queryFn: fetchUnreadCounts,
    enabled: Boolean(user) && !isDemo,
  });
  const { data: refreshedUser } = useQuery<AuthUser>({
    queryKey: ['auth', 'me-role'],
    queryFn: () => apiFetch<AuthUser>('/me'),
    enabled:
      Boolean(user) &&
      !isDemo &&
      (user?.role === undefined ||
        user?.experimentalTrainingCourt === undefined ||
        user?.grip === undefined),
  });

  useEffect(() => {
    if (unreadMap) setUnread(unreadMap);
  }, [unreadMap, setUnread]);

  useEffect(() => {
    if (!refreshedUser) return;
    const patch: Partial<AuthUser> = {};
    if (refreshedUser.role !== undefined) patch.role = refreshedUser.role;
    if (refreshedUser.experimentalTrainingCourt !== undefined) {
      patch.experimentalTrainingCourt = refreshedUser.experimentalTrainingCourt;
    }
    if (refreshedUser.grip !== undefined) patch.grip = refreshedUser.grip;
    if (Object.keys(patch).length > 0) {
      updateUser(patch);
    }
  }, [refreshedUser, updateUser]);

  useEffect(() => {
    if (isDemo) return;
    const route = routeFromLocation(location);
    if (isGameRoute(location.pathname)) rememberRoute(LAST_GAME_ROUTE_KEY, DEFAULT_GAME_ROUTE);
    if (isChatRoute(location.pathname)) {
      lastChatRouteRef.current = route;
      rememberRoute(LAST_CHAT_ROUTE_KEY, route);
    }
  }, [isDemo, location]);

  // Hide nav inside a chat room — composer takes the nav's spot.
  if (!isBottomNavVisible(location, user)) {
    return null;
  }

  const isSections = isSectionContext(location);
  const isGame = isDemo || (isGameRoute(location.pathname) && !isSections);
  const isProfile = location.pathname.startsWith('/profile');
  const isAdmin = location.pathname.startsWith('/admin');
  const isChat = !isDemo && isChatRoute(location.pathname);
  const showAdmin = !isDemo && user?.role === 'admin';
  const inactiveIconColor = isDemo ? 'rgba(71, 85, 105, 0.48)' : 'var(--muted)';
  const openLastGameRoute = (): void => {
    rememberRoute(LAST_GAME_ROUTE_KEY, DEFAULT_GAME_ROUTE);
    navigate(DEFAULT_GAME_ROUTE);
  };
  const openLastChatRoute = (): void => {
    if (isChat) {
      lastChatRouteRef.current = DEFAULT_CHAT_ROUTE;
      rememberRoute(LAST_CHAT_ROUTE_KEY, DEFAULT_CHAT_ROUTE);
      navigate(DEFAULT_CHAT_ROUTE);
      return;
    }
    navigate(
      lastChatRouteRef.current || readRememberedRoute(LAST_CHAT_ROUTE_KEY, DEFAULT_CHAT_ROUTE),
    );
  };
  const openProfileRoute = (): void => {
    navigate('/profile');
  };
  const openSectionsRoute = (): void => {
    navigate('/sections');
  };
  const openAdminRoute = (): void => {
    if (isAdmin) {
      window.dispatchEvent(new Event(ADMIN_NAV_HOME_EVENT));
    }
    navigate('/admin');
  };

  return (
    <div
      className="bottom-nav-shell glass-edge-fade glass-edge-fade--bottom"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: '40px 12px var(--bottom-nav-bottom-gap)',
        zIndex: 5,
        pointerEvents: 'none',
      }}
    >
      <nav
        className="glass-dock-surface"
        aria-label={isDemo ? 'Демо-навигация' : 'Навигация'}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 406,
          margin: '0 auto',
          height: 54,
          borderRadius: 999,
          display: 'grid',
          gridTemplateColumns: `repeat(${showAdmin ? 5 : 4}, 1fr)`,
          alignItems: 'center',
          padding: '0 6px',
          zIndex: 500,
          pointerEvents: isDemo ? 'none' : 'auto',
        }}
      >
        <NavTab
          label="Игра"
          disabled={isDemo}
          active={isGame}
          icon={
            <Gamepad2
              size={ICON_SIZE}
              color={isGame ? '#ffffff' : inactiveIconColor}
              strokeWidth={2}
            />
          }
          onClick={openLastGameRoute}
        />
        <NavTab
          label="Разделы"
          disabled={isDemo}
          active={isSections}
          icon={
            <Package
              size={ICON_SIZE}
              color={isSections ? '#ffffff' : inactiveIconColor}
              strokeWidth={2}
            />
          }
          onClick={openSectionsRoute}
        />
        <NavTab
          label="Чат"
          disabled={isDemo}
          active={isChat}
          icon={
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <MessageCircle
                size={ICON_SIZE}
                color={isChat ? '#ffffff' : inactiveIconColor}
                strokeWidth={2}
              />
              {!isDemo && totalUnread > 0 && (
                <span
                  aria-label={`Непрочитанные: ${totalUnread}`}
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -6,
                    minWidth: 16,
                    height: 16,
                    padding: '0 4px',
                    borderRadius: 999,
                    background: 'rgb(220, 38, 38)',
                    color: '#ffffff',
                    fontSize: 9,
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 0 0 2px rgba(218, 230, 246, 0.96)',
                  }}
                >
                  {totalUnread > 99 ? '99+' : totalUnread}
                </span>
              )}
            </span>
          }
          onClick={openLastChatRoute}
        />
        <NavTab
          label="Профиль"
          disabled={isDemo}
          active={isProfile}
          icon={
            <User
              size={ICON_SIZE}
              color={isProfile ? '#ffffff' : inactiveIconColor}
              strokeWidth={2}
            />
          }
          onClick={openProfileRoute}
        />
        {showAdmin && (
          <NavTab
            label="Админ"
            active={isAdmin}
            icon={
              <ShieldCheck
                size={ICON_SIZE}
                color={isAdmin ? '#ffffff' : 'var(--muted)'}
                strokeWidth={2}
              />
            }
            onClick={openAdminRoute}
          />
        )}
      </nav>
    </div>
  );
}

interface NavTabProps {
  label: string;
  active: boolean;
  icon: JSX.Element;
  onClick: () => void;
  disabled?: boolean;
}

function NavTab({ label, active, icon, onClick, disabled = false }: NavTabProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'none',
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        padding: 0,
        height: '100%',
        touchAction: 'manipulation',
        opacity: disabled && !active ? 0.58 : 1,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: active ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.55)',
          border: active ? 'none' : '1px solid rgba(255, 255, 255, 0.7)',
          transition: 'background 0.15s',
        }}
      >
        {icon}
      </div>
    </button>
  );
}
