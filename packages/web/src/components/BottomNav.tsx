import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, MessageCircle, Settings, Target, Trophy, User } from 'lucide-react';
import { useAuthStore } from '../auth/authStore.js';

export const NAV_HEIGHT = 62;

const ICON_SIZE = 22;

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
        className="glass"
        style={{
          position: 'fixed',
          left: 14,
          right: 14,
          bottom: `calc(14px + env(safe-area-inset-bottom, 0px) / 2)`,
          maxWidth: 402,
          margin: '0 auto',
          height: NAV_HEIGHT - 8,
          borderRadius: 22,
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          alignItems: 'center',
          padding: '0 6px',
          zIndex: 100,
        }}
      >
        <NavTab
          label="Игра"
          active={isGame}
          icon={<Target size={ICON_SIZE} color={isGame ? '#ffffff' : 'var(--muted)'} strokeWidth={2} />}
          onClick={() => navigate('/')}
        />
        <NavTab
          label="Сюжет"
          active={false}
          icon={<BookOpen size={ICON_SIZE} color="var(--muted)" strokeWidth={2} />}
          onClick={() => setModal('story')}
        />
        <NavTab
          label="Рейтинг"
          active={false}
          icon={<Trophy size={ICON_SIZE} color="var(--muted)" strokeWidth={2} />}
          onClick={() => setModal('rating')}
        />
        <NavTab
          label="Чат"
          active={false}
          icon={<MessageCircle size={ICON_SIZE} color="var(--muted)" strokeWidth={2} />}
          onClick={() => setModal('chat')}
        />
        <NavTab
          label="Профиль"
          active={isProfile}
          icon={<User size={ICON_SIZE} color={isProfile ? '#ffffff' : 'var(--muted)'} strokeWidth={2} />}
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
              background: 'rgba(15, 23, 42, 0.35)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              zIndex: 200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
            }}
          >
            <div
              className="glass"
              onClick={(e) => e.stopPropagation()}
              style={{
                borderRadius: 24,
                padding: '32px 40px',
                textAlign: 'center',
                minWidth: 240,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                <Settings
                  size={42}
                  color="var(--ink)"
                  strokeWidth={1.5}
                  style={{ animation: 'gear-spin 3s linear infinite' }}
                />
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                В разработке
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 22 }}>Скоро появится</div>
              <button
                type="button"
                className="btn btn--cta"
                onClick={() => setModal(null)}
                style={{ padding: '11px 28px', fontSize: 14 }}
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
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        height: '100%',
        touchAction: 'manipulation',
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
