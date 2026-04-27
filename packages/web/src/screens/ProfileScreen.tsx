import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Info, LogOut } from 'lucide-react';
import { apiFetch } from '../api/apiFetch.js';
import { useAuthStore } from '../auth/authStore.js';
import { useLogout } from '../auth/useLogout.js';
import { NAV_HEIGHT } from '../components/BottomNav.js';
import { StatCard } from '../components/StatCard.js';

interface ProfileData {
  id: string;
  displayName: string;
  avatarUrl?: string;
  grip: 'right' | 'left';
  tgId?: string;
  username?: string;
}

export function ProfileScreen(): JSX.Element {
  const queryClient = useQueryClient();
  const logout = useLogout();
  const updateUser = useAuthStore((s) => s.updateUser);

  const { data, isLoading } = useQuery<ProfileData>({
    queryKey: ['profile'],
    queryFn: () => apiFetch<ProfileData>('/me'),
  });

  const [grip, setGrip] = useState<'right' | 'left'>('right');
  const [gripInfoOpen, setGripInfoOpen] = useState(false);
  useEffect(() => {
    if (data) {
      setGrip(data.grip);
      updateUser({ grip: data.grip });
    }
  }, [data, updateUser]);

  const { mutate: saveGrip, isPending: savingGrip } = useMutation({
    mutationFn: (g: 'right' | 'left') =>
      apiFetch<{ grip: string }>('/me', {
        method: 'PATCH',
        body: JSON.stringify({ grip: g }),
      }),
    onMutate: (g) => {
      setGrip(g);
      updateUser({ grip: g });
    },
    onSuccess: (_res, g) => {
      queryClient.setQueryData<ProfileData>(['profile'], (old) =>
        old ? { ...old, grip: g } : old,
      );
    },
    onError: () => {
      if (data) {
        setGrip(data.grip);
        updateUser({ grip: data.grip });
      }
    },
  });

  if (isLoading) {
    return (
      <main
        className="screen"
        style={{ alignItems: 'center', justifyContent: 'center' }}
      >
        <div style={{ color: 'var(--muted)', fontSize: 14 }}>Загрузка…</div>
      </main>
    );
  }

  const initial = (data?.displayName ?? '?').charAt(0).toUpperCase();

  return (
    <main
      className="screen"
      style={{
        paddingBottom: `calc(${NAV_HEIGHT + 16}px + env(safe-area-inset-bottom, 0px) / 2)`,
      }}
    >
      <div
        className="glass"
        style={{
          margin: '16px 14px 14px',
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
            {data?.displayName ?? '—'}
          </div>
          {(data?.username || data?.tgId) && (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {data.username ? `@${data.username}` : `id ${data.tgId}`}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <span className="pill"><small>Ранг</small> —</span>
          <span className="pill pill--dark"><small>Уровень</small> —</span>
        </div>
      </div>

      <div className="section-label" style={{ marginBottom: 6 }}>Статистика</div>
      <div
        style={{
          margin: '0 14px 14px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
        }}
      >
        <StatCard label="Всего бросков" value="—" />
        <StatCard label="Голов" value="—" />
        <StatCard label="Точность" value="—" />
        <StatCard label="Вратарей пройдено" value="—" suffix="/10" />
      </div>

      <div
        className="section-label"
        style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <span>Хват клюшки</span>
        <button
          type="button"
          onClick={() => setGripInfoOpen(true)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
          }}
          aria-label="О хвате"
        >
          <Info size={12} color="var(--muted)" />
        </button>
      </div>
      <div style={{ margin: '0 14px 14px', display: 'flex', gap: 8 }}>
        <GripOption
          label="Левый"
          hint="Шайба слева"
          active={grip === 'left'}
          disabled={savingGrip}
          sprite="/sprites/lefthand.webp"
          side="left"
          onClick={() => {
            if (grip !== 'left') saveGrip('left');
          }}
        />
        <GripOption
          label="Правый"
          hint="Шайба справа"
          active={grip === 'right'}
          disabled={savingGrip}
          sprite="/sprites/righthand.webp"
          side="right"
          onClick={() => {
            if (grip !== 'right') saveGrip('right');
          }}
        />
      </div>

      <div style={{ margin: '4px 14px 0' }}>
        <button
          type="button"
          className="glass"
          onClick={() => void logout()}
          style={{
            width: '100%',
            padding: '14px 0',
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--ink)',
            borderRadius: 16,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <LogOut size={16} />
          Выйти
        </button>
      </div>

      {gripInfoOpen && (
        <div
          onClick={() => setGripInfoOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.35)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 250,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            className="glass"
            onClick={(e) => e.stopPropagation()}
            style={{ borderRadius: 24, padding: '22px 22px 18px', maxWidth: 320, width: '100%' }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>
              Хват клюшки
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
              При правом хвате можно бросить вплотную у правого борта — слева шайба не докатится. При левом — наоборот.
            </div>
            <button
              type="button"
              className="btn btn--cta"
              onClick={() => setGripInfoOpen(false)}
              style={{ marginTop: 18, width: '100%', padding: '12px 0', fontSize: 14 }}
            >
              Понятно
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

interface GripOptionProps {
  label: string;
  hint: string;
  active: boolean;
  disabled: boolean;
  sprite: string;
  side: 'left' | 'right';
  onClick: () => void;
}

function GripOption({ label, hint, active, disabled, sprite, side, onClick }: GripOptionProps): JSX.Element {
  const SIZE = 72;
  const puckSize = 3;
  const puckSide = side === 'left' ? 'right' : 'left';
  return (
    <button
      type="button"
      className={active ? 'glass-dark' : 'glass'}
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        padding: '14px 10px',
        borderRadius: 16,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'opacity 0.15s',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <div style={{
        position: 'relative', width: SIZE, height: SIZE,
        transform: `rotate(${side === 'left' ? -18.3 : 18.3}deg)`,
      }}>
        <img
          src={sprite}
          alt=""
          aria-hidden
          style={{
            width: SIZE,
            height: SIZE,
            objectFit: 'contain',
            filter: active
              ? 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.3))'
              : 'drop-shadow(0 1px 3px rgba(15, 23, 42, 0.15))',
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 'calc(14% - 3px)',
            [puckSide]: 'calc(37% + 10px)',
            width: puckSize,
            height: puckSize,
            borderRadius: '50%',
            background: '#0f172a',
            boxShadow:
              'inset 0 -1px 1px rgba(255, 255, 255, 0.2), 0 1px 2px rgba(15, 23, 42, 0.45)',
          }}
        />
      </div>
      <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 10, opacity: 0.7 }}>{hint}</span>
    </button>
  );
}


