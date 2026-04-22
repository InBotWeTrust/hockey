import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, Trophy, MessageCircle, User, Settings } from 'lucide-react';
import { useAuthStore } from '../auth/authStore.js';

const ACCENT = '#0f172a';
const MUTED = '#94a3b8';
const BG = '#ffffff';
const BORDER = '#e2e8f0';

export const NAV_HEIGHT = 62;

const ICON_SIZE = 22;

function IconHockey({ color }: { color: string }): JSX.Element {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
      {/* stick shaft */}
      <line x1="5" y1="4" x2="14" y2="17" stroke={color} strokeWidth="2" strokeLinecap="round" />
      {/* blade */}
      <path d="M14 17 Q18 18 18 15" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* puck */}
      <ellipse cx="18" cy="19.5" rx="3" ry="1.5" stroke={color} strokeWidth="1.8" />
    </svg>
  );
}

export function BottomNav(): JSX.Element | null {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const navigate = useNavigate();
  const [modal, setModal] = useState<'story' | 'rating' | 'chat' | null>(null);

  if (!user || location.pathname === '/login') return null;

  const isGame = location.pathname === '/' || location.pathname.startsWith('/duel');
  const isProfile = location.pathname === '/profile';

  return (
    <>
      <nav
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: NAV_HEIGHT,
          background: BG,
          borderTop: `1px solid ${BORDER}`,
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          zIndex: 100,
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) / 2)',
        }}
      >
        <NavTab
          label="Игра"
          active={isGame}
          icon={<IconHockey color={isGame ? ACCENT : MUTED} />}
          onClick={() => navigate('/')}
        />
        <NavTab
          label="Сюжет"
          active={false}
          icon={<BookOpen size={ICON_SIZE} color={MUTED} />}
          onClick={() => setModal('story')}
        />
        <NavTab
          label="Рейтинг"
          active={false}
          icon={<Trophy size={ICON_SIZE} color={MUTED} />}
          onClick={() => setModal('rating')}
        />
        <NavTab
          label="Чат"
          active={false}
          icon={<MessageCircle size={ICON_SIZE} color={MUTED} />}
          onClick={() => setModal('chat')}
        />
        <NavTab
          label="Профиль"
          active={isProfile}
          icon={<User size={ICON_SIZE} color={isProfile ? ACCENT : MUTED} />}
          onClick={() => navigate('/profile')}
        />
      </nav>

      {modal !== null && (
        <>
          <style>{`
            @keyframes gear-spin {
              from { transform: rotate(0deg); }
              to   { transform: rotate(360deg); }
            }
          `}</style>
          <div
            role="dialog"
            onClick={() => setModal(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15,23,42,0.5)',
              zIndex: 200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#ffffff',
                borderRadius: 24,
                padding: '36px 48px',
                textAlign: 'center',
                boxShadow: '0 24px 64px rgba(0,0,0,0.16)',
                minWidth: 240,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
                <Settings
                  size={44}
                  color={ACCENT}
                  strokeWidth={1.5}
                  style={{ animation: 'gear-spin 3s linear infinite' }}
                />
              </div>
              <div style={{ fontSize: 19, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
                В разработке
              </div>
              <div style={{ fontSize: 13, color: MUTED, marginBottom: 24 }}>Скоро появится</div>
              <button
                onClick={() => setModal(null)}
                style={{
                  padding: '11px 32px',
                  fontSize: 15,
                  fontWeight: 600,
                  background: ACCENT,
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 12,
                  cursor: 'pointer',
                  letterSpacing: 0.3,
                }}
              >
                Закрыть
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

interface NavTabProps {
  label: string;
  active: boolean;
  icon: JSX.Element;
  onClick: () => void;
}

function NavTab({ label, active, icon, onClick }: NavTabProps): JSX.Element {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '6px 0',
        touchAction: 'manipulation',
      }}
    >
      {icon}
      <span
        style={{
          fontSize: 10,
          fontWeight: active ? 600 : 400,
          color: active ? ACCENT : MUTED,
          letterSpacing: 0.3,
        }}
      >
        {label}
      </span>
    </button>
  );
}
