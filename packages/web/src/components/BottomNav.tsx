import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Gamepad2, MessageCircle, Package, ShieldCheck, User } from 'lucide-react';
import { apiFetch } from '../api/apiFetch.js';
import { achievementKeys, fetchAchievements } from '../api/achievements.js';
import { fetchAmateurEvents, type AmateurDuelMatch } from '../api/amateurDuel.js';
import { fetchWeeklyChallenge } from '../api/weeklyChallenge.js';
import { useAuthStore } from '../auth/authStore.js';
import type { AuthUser } from '../auth/authStore.js';
import { fetchUnreadCounts } from '../chat/api.js';
import { useChatStore } from '../chat/chatStore.js';
import { chatKeys } from '../lib/queryKeys.js';

export const NAV_HEIGHT = 68;

const ICON_SIZE = 22;
const LAST_GAME_ROUTE_KEY = 'hockey.nav.lastGameRoute';
const LAST_SECTIONS_ROUTE_KEY = 'hockey.nav.lastSectionsRoute';
const LAST_CHAT_ROUTE_KEY = 'hockey.nav.lastChatRoute';
const LAST_PROFILE_ROUTE_KEY = 'hockey.nav.lastProfileRoute';
const DEFAULT_GAME_ROUTE = '/?view=arena';
const DEFAULT_SECTIONS_ROUTE = '/sections';
const DEFAULT_CHAT_ROUTE = '/chat';
const DEFAULT_PROFILE_ROUTE = '/profile';
export const ADMIN_NAV_HOME_EVENT = 'hockey:admin-nav-home';

function isActionableDuelEvent(match: AmateurDuelMatch): boolean {
  if (match.status === 'invited') {
    return match.me.side === 'opponent' && match.me.state === 'invited';
  }
  if (match.status === 'ready_check') {
    return match.me.state !== 'ready' || match.opponent.state === 'ready';
  }
  if (match.status === 'active') {
    return match.me.state === 'accepted' || match.me.state === 'period_active';
  }
  return false;
}

function routeFromLocation(location: ReturnType<typeof useLocation>): string {
  return `${location.pathname}${location.search}${location.hash}`;
}

function isGameRoute(pathname: string): boolean {
  return pathname === '/' || pathname.startsWith('/duel');
}

function isChatRoute(pathname: string): boolean {
  return pathname.startsWith('/chat');
}

function isProfileRoute(pathname: string): boolean {
  return pathname.startsWith('/profile');
}

function isSectionContext(location: ReturnType<typeof useLocation>): boolean {
  if (
    location.pathname.startsWith('/sections') ||
    location.pathname.startsWith('/achievements') ||
    location.pathname.startsWith('/weekly-challenge') ||
    location.pathname.startsWith('/inventory') ||
    location.pathname.startsWith('/daily') ||
    location.pathname.startsWith('/bonus-games')
  ) {
    return true;
  }
  if (location.pathname !== '/') return false;
  const params = new URLSearchParams(location.search);
  if (params.get('play') === '1') return false;
  const view = params.get('view');
  if (view === 'amateur') return true;
  if (params.get('from') !== 'sections') return false;
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
  if (/^\/bonus-games\/[^/]+\/play$/.test(location.pathname)) return true;
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
  const lastSectionsRouteRef = useRef(
    readRememberedRoute(LAST_SECTIONS_ROUTE_KEY, DEFAULT_SECTIONS_ROUTE),
  );
  const lastChatRouteRef = useRef(readRememberedRoute(LAST_CHAT_ROUTE_KEY, DEFAULT_CHAT_ROUTE));
  const lastProfileRouteRef = useRef(
    readRememberedRoute(LAST_PROFILE_ROUTE_KEY, DEFAULT_PROFILE_ROUTE),
  );

  const totalUnread = useChatStore((s) => s.totalUnread());
  const setUnread = useChatStore((s) => s.setUnread);

  const { data: unreadMap } = useQuery<Record<string, number>>({
    queryKey: chatKeys.unread(),
    queryFn: fetchUnreadCounts,
    enabled: Boolean(user) && !isDemo,
  });
  const { data: amateurEvents } = useQuery({
    queryKey: ['amateur-duel', 'events'],
    queryFn: fetchAmateurEvents,
    enabled: Boolean(user) && !isDemo,
    refetchInterval: 15_000,
  });
  const { data: weeklyChallenge } = useQuery({
    queryKey: ['weekly-challenge', 'nav'],
    queryFn: fetchWeeklyChallenge,
    enabled: Boolean(user) && !isDemo,
    refetchInterval: 60_000,
  });
  const { data: achievements } = useQuery({
    queryKey: achievementKeys.all,
    queryFn: fetchAchievements,
    enabled: Boolean(user) && !isDemo,
    refetchInterval: 30_000,
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
    if (isSectionContext(location)) {
      lastSectionsRouteRef.current = route;
      rememberRoute(LAST_SECTIONS_ROUTE_KEY, route);
    }
    if (isChatRoute(location.pathname)) {
      lastChatRouteRef.current = route;
      rememberRoute(LAST_CHAT_ROUTE_KEY, route);
    }
    if (isProfileRoute(location.pathname)) {
      lastProfileRouteRef.current = route;
      rememberRoute(LAST_PROFILE_ROUTE_KEY, route);
    }
  }, [isDemo, location]);

  // Hide nav inside a chat room — composer takes the nav's spot.
  if (!isBottomNavVisible(location, user)) {
    return null;
  }

  const isSections = isSectionContext(location);
  const isGame = isDemo || (isGameRoute(location.pathname) && !isSections);
  const isProfile = isProfileRoute(location.pathname);
  const isAdmin = location.pathname.startsWith('/admin');
  const isChat = !isDemo && isChatRoute(location.pathname);
  const showAdmin = !isDemo && user?.role === 'admin';
  const gameActionCount = (amateurEvents?.events ?? []).filter(isActionableDuelEvent).length;
  const currentSectionActionCount =
    weeklyChallenge?.challenge?.canJoin === true ||
    weeklyChallenge?.challenge?.canClaimReward === true
      ? 1
      : 0;
  const sectionActionCount =
    currentSectionActionCount +
    (weeklyChallenge?.pendingRewards?.length ?? 0) +
    (achievements?.unclaimedCount ?? 0);
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
    if (isProfile) {
      lastProfileRouteRef.current = DEFAULT_PROFILE_ROUTE;
      rememberRoute(LAST_PROFILE_ROUTE_KEY, DEFAULT_PROFILE_ROUTE);
      navigate(DEFAULT_PROFILE_ROUTE);
      return;
    }
    navigate(
      lastProfileRouteRef.current ||
        readRememberedRoute(LAST_PROFILE_ROUTE_KEY, DEFAULT_PROFILE_ROUTE),
    );
  };
  const openSectionsRoute = (): void => {
    if (isSections) {
      lastSectionsRouteRef.current = DEFAULT_SECTIONS_ROUTE;
      rememberRoute(LAST_SECTIONS_ROUTE_KEY, DEFAULT_SECTIONS_ROUTE);
      navigate(DEFAULT_SECTIONS_ROUTE);
      return;
    }
    navigate(
      lastSectionsRouteRef.current ||
        readRememberedRoute(LAST_SECTIONS_ROUTE_KEY, DEFAULT_SECTIONS_ROUTE),
    );
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
        className="bottom-nav__dock glass-dock-surface"
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
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <Gamepad2 size={ICON_SIZE} strokeWidth={2} />
              {!isDemo && gameActionCount > 0 && (
                <span
                  aria-label={`События игры: ${gameActionCount}`}
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
                  {gameActionCount > 9 ? '9+' : gameActionCount}
                </span>
              )}
            </span>
          }
          onClick={openLastGameRoute}
        />
        <NavTab
          label="Разделы"
          disabled={isDemo}
          active={isSections}
          icon={
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <Package size={ICON_SIZE} strokeWidth={2} />
              {!isDemo && sectionActionCount > 0 && (
                <span
                  aria-label={`События разделов: ${sectionActionCount}`}
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
                  {sectionActionCount}
                </span>
              )}
            </span>
          }
          onClick={openSectionsRoute}
        />
        <NavTab
          label="Чат"
          disabled={isDemo}
          active={isChat}
          icon={
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <MessageCircle size={ICON_SIZE} strokeWidth={2} />
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
          label="Раздевалка"
          disabled={isDemo}
          active={isProfile}
          icon={<User size={ICON_SIZE} strokeWidth={2} />}
          onClick={openProfileRoute}
        />
        {showAdmin && (
          <NavTab
            label="Админ"
            active={isAdmin}
            icon={<ShieldCheck size={ICON_SIZE} strokeWidth={2} />}
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
      aria-current={active ? 'page' : undefined}
      className={`bottom-nav__tab${active ? ' bottom-nav__tab--active' : ''}`}
    >
      <span className={`bottom-nav__icon-wrap${active ? ' bottom-nav__icon-wrap--active' : ''}`}>
        {icon}
        {active && <span className="bottom-nav__active-indicator" aria-hidden="true" />}
      </span>
    </button>
  );
}
