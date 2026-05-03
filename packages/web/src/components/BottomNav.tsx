import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Gamepad2, MessageCircle, Package, ShieldCheck, Trophy, User } from 'lucide-react';
import { apiFetch } from '../api/apiFetch.js';
import { useAuthStore } from '../auth/authStore.js';
import type { AuthUser } from '../auth/authStore.js';
import { fetchUnreadCounts } from '../chat/api.js';
import { useChatStore } from '../chat/chatStore.js';
import { chatKeys } from '../lib/queryKeys.js';

export const NAV_HEIGHT = 68;

const ICON_SIZE = 22;

export function BottomNav(): JSX.Element | null {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const location = useLocation();
  const navigate = useNavigate();
  const isDemo = location.pathname === '/demo';
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

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
    enabled: Boolean(user) && !isDemo && user?.role === undefined,
  });

  useEffect(() => {
    if (unreadMap) setUnread(unreadMap);
  }, [unreadMap, setUnread]);

  useEffect(() => {
    if (refreshedUser?.role !== undefined) {
      updateUser({ role: refreshedUser.role });
    }
  }, [refreshedUser, updateUser]);

  useEffect(
    () => () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    },
    [],
  );

  function showToast(label: string): void {
    setToast(label);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 1800);
  }

  // Hide nav inside a chat room — composer takes the nav's spot.
  const isInChatRoom = /^\/chat\/[^/]+(?:\/posts\/[^/]+\/comments)?$/.test(location.pathname);
  if (location.pathname === '/login' || isInChatRoom || (!user && !isDemo)) {
    return null;
  }

  const isGame = isDemo || location.pathname === '/' || location.pathname.startsWith('/duel');
  const isInventory = location.pathname.startsWith('/inventory');
  const isProfile = location.pathname.startsWith('/profile');
  const isAdmin = location.pathname.startsWith('/admin');
  const showAdmin = !isDemo && user?.role === 'admin';
  const inactiveIconColor = isDemo ? 'rgba(71, 85, 105, 0.48)' : 'var(--muted)';

  return (
    <div
      className="bottom-nav-shell glass-edge-fade glass-edge-fade--bottom"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: '28px 12px max(12px, var(--app-safe-bottom))',
        zIndex: 5,
        pointerEvents: 'none',
      }}
    >
      <nav
        aria-label={isDemo ? 'Демо-навигация' : 'Навигация'}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 406,
          margin: '0 auto',
          height: 54,
          borderRadius: 999,
          display: 'grid',
          gridTemplateColumns: `repeat(${showAdmin ? 6 : 5}, 1fr)`,
          alignItems: 'center',
          padding: '0 6px',
          zIndex: 500,
          background: 'rgba(232, 242, 255, 0.62)',
          backdropFilter: 'blur(24px) saturate(135%)',
          WebkitBackdropFilter: 'blur(24px) saturate(135%)',
          boxShadow:
            '0 18px 36px rgba(42, 91, 132, 0.22), 0 -1px 0 rgba(255, 255, 255, 0.5) inset',
          border: '1px solid rgba(255,255,255,0.78)',
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
          onClick={() => navigate('/?view=hub')}
        />
        <NavTab
          label="Инвентарь"
          disabled={isDemo}
          active={isInventory}
          icon={
            <Package
              size={ICON_SIZE}
              color={isInventory ? '#ffffff' : inactiveIconColor}
              strokeWidth={2}
            />
          }
          onClick={() => navigate('/inventory')}
        />
        <NavTab
          label="Рейтинг"
          disabled={isDemo}
          active={false}
          icon={<Trophy size={ICON_SIZE} color={inactiveIconColor} strokeWidth={2} />}
          onClick={() => showToast('Рейтинг — в разработке')}
        />
        <NavTab
          label="Чат"
          disabled={isDemo}
          active={!isDemo && location.pathname.startsWith('/chat')}
          icon={
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <MessageCircle
                size={ICON_SIZE}
                color={
                  !isDemo && location.pathname.startsWith('/chat') ? '#ffffff' : inactiveIconColor
                }
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
          onClick={() => navigate('/chat')}
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
          onClick={() => navigate('/profile')}
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
            onClick={() => navigate('/admin')}
          />
        )}
      </nav>

      {toast !== null && (
        <>
          <style>{`
            @keyframes nav-toast-in {
              from { opacity: 0; transform: translate(-50%, 8px); }
              to   { opacity: 1; transform: translate(-50%, 0); }
            }
          `}</style>
          <div
            role="status"
            aria-live="polite"
            style={{
              position: 'fixed',
              left: '50%',
              transform: 'translateX(-50%)',
              bottom: 'calc(66px + max(12px, var(--app-safe-bottom)))',
              padding: '10px 18px',
              borderRadius: 999,
              background: 'rgba(15, 23, 42, 0.92)',
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 600,
              boxShadow: '0 12px 30px rgba(15, 23, 42, 0.35)',
              zIndex: 600,
              pointerEvents: 'none',
              animation: 'nav-toast-in 180ms ease-out',
              whiteSpace: 'nowrap',
            }}
          >
            {toast}
          </div>
        </>
      )}
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
