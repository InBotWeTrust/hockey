import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/apiFetch.js';
import { useAuthStore } from '../auth/authStore.js';
import { NAV_HEIGHT } from '../components/BottomNav.js';
import { StatCard } from '../components/StatCard.js';
import type { ProfileData } from './profileTypes.js';

export function ProfileScreen(): JSX.Element {
  const navigate = useNavigate();
  const updateUser = useAuthStore((s) => s.updateUser);

  const { data, isLoading } = useQuery<ProfileData>({
    queryKey: ['profile'],
    queryFn: () => apiFetch<ProfileData>('/me'),
  });

  useEffect(() => {
    if (data) {
      updateUser({
        grip: data.grip,
        displayName: data.displayName,
        ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
        ...(data.displaySource !== undefined ? { displaySource: data.displaySource } : {}),
        ...(data.linkedProviders !== undefined ? { linkedProviders: data.linkedProviders } : {}),
      });
    }
  }, [data, updateUser]);

  if (isLoading) {
    return (
      <main className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--muted)', fontSize: 14 }}>Загрузка...</div>
      </main>
    );
  }

  const initial = (data?.displayName ?? '?').charAt(0).toUpperCase();

  return (
    <main
      className="screen"
      style={{
        paddingBottom: `calc(${NAV_HEIGHT + 16}px + var(--app-safe-bottom))`,
      }}
    >
      <div
        className="glass"
        style={{
          margin: 'calc(16px + var(--app-safe-top)) 14px 14px',
          padding: 20,
          borderRadius: 24,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
        }}
      >
        {data?.avatarUrl ? (
          <img
            src={data.avatarUrl}
            alt="avatar"
            style={{
              width: 88,
              height: 88,
              borderRadius: 999,
              objectFit: 'cover',
              boxShadow: '0 10px 26px rgba(15, 23, 42, 0.25)',
            }}
          />
        ) : (
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: 999,
              background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
              color: '#ffffff',
              fontSize: 32,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 10px 26px rgba(15, 23, 42, 0.25)',
            }}
          >
            {initial}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', textAlign: 'center' }}>
            {data?.displayName ?? '-'}
          </div>
          {(data?.username || data?.tgId) && (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {data.username ? `@${data.username}` : `id ${data.tgId}`}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <span className="pill">
            <small>Ранг</small> -
          </span>
          <span className="pill pill--dark">
            <small>Уровень</small> -
          </span>
        </div>
      </div>

      <div className="section-label" style={{ marginBottom: 6 }}>
        Статистика
      </div>
      <div
        style={{
          margin: '0 14px 14px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
        }}
      >
        <StatCard label="Всего бросков" value="-" />
        <StatCard label="Голов" value="-" />
        <StatCard label="Точность" value="-" />
        <StatCard label="Вратарей пройдено" value="-" suffix="/10" />
      </div>

      <div className="section-label" style={{ marginBottom: 6 }}>
        Настройки
      </div>
      <div style={{ margin: '0 14px' }}>
        <button
          type="button"
          className="glass"
          onClick={() => navigate('/profile/settings')}
          style={{
            width: '100%',
            padding: '14px 14px',
            borderRadius: 16,
            cursor: 'pointer',
            display: 'grid',
            gridTemplateColumns: '38px 1fr auto',
            alignItems: 'center',
            gap: 10,
            textAlign: 'left',
            color: 'var(--ink)',
          }}
        >
          <span
            aria-hidden
            style={{
              width: 38,
              height: 38,
              borderRadius: 999,
              background: 'rgba(15, 23, 42, 0.08)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Settings size={17} />
          </span>
          <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>Настройки</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Аккаунт и хват игрока</span>
          </span>
          <ChevronRight size={18} color="var(--muted)" />
        </button>
      </div>
    </main>
  );
}
