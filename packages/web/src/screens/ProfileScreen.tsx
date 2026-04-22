import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { apiFetch } from '../api/apiFetch.js';
import { useAuthStore } from '../auth/authStore.js';
import { useLogout } from '../auth/useLogout.js';
import { NAV_HEIGHT } from '../components/BottomNav.js';

const BG = '#f4f7fb';
const PANEL = '#ffffff';
const PANEL_BORDER = '#e2e8f0';
const TEXT = '#0f172a';
const MUTED = '#64748b';
const ACCENT = '#0f172a';

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
      <main style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: MUTED, fontSize: 14 }}>Загрузка...</div>
      </main>
    );
  }

  const initial = (data?.displayName ?? '?').charAt(0).toUpperCase();

  return (
    <main
      style={{
        background: BG,
        minHeight: '100vh',
        paddingBottom: `calc(${NAV_HEIGHT + 16}px + env(safe-area-inset-bottom, 0px) / 2)`,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: TEXT,
      }}
    >
      {/* Avatar + name */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '32px 24px 20px',
          gap: 10,
        }}
      >
        {data?.avatarUrl ? (
          <img
            src={data.avatarUrl}
            alt="avatar"
            style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', boxShadow: '0 2px 12px rgba(0,0,0,0.12)' }}
          />
        ) : (
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: '50%',
              background: ACCENT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 36,
              fontWeight: 700,
              color: '#ffffff',
            }}
          >
            {initial}
          </div>
        )}
        <div style={{ fontSize: 22, fontWeight: 700, textAlign: 'center' }}>
          {data?.displayName ?? '—'}
        </div>
        {data?.username && (
          <div style={{ fontSize: 14, color: MUTED }}>@{data.username}</div>
        )}
      </div>

      {/* Info card */}
      <div style={{ padding: '0 16px 12px' }}>
        <div
          style={{
            background: PANEL,
            border: `1px solid ${PANEL_BORDER}`,
            borderRadius: 16,
            overflow: 'hidden',
          }}
        >
          {data?.tgId && (
            <InfoRow label="Telegram ID" value={data.tgId} />
          )}
          {data?.username && (
            <InfoRow label="Юзернейм" value={`@${data.username}`} last={!data?.tgId} />
          )}
        </div>
      </div>

      {/* Grip */}
      <div style={{ padding: '0 16px 12px' }}>
        <div
          style={{
            background: PANEL,
            border: `1px solid ${PANEL_BORDER}`,
            borderRadius: 16,
            padding: '14px 16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: MUTED, fontWeight: 500 }}>ХВАТ</span>
            <button
onClick={() => setGripInfoOpen(true)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <Info size={14} color={MUTED} />
            </button>
          </div>
          {gripInfoOpen && (
            <div
              onClick={() => setGripInfoOpen(false)}
              style={{
                position: 'fixed', inset: 0,
                background: 'rgba(15,23,42,0.45)',
                zIndex: 200, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontFamily: 'system-ui, -apple-system, sans-serif',
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: PANEL, borderRadius: 20,
                  padding: '24px 24px 20px', maxWidth: 300,
                  boxShadow: '0 16px 48px rgba(0,0,0,0.16)',
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 10 }}>Хват</div>
                <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.6 }}>
                  При правом хвате можно бросить вплотную около правого борта. До левого борта шайба будет чуть-чуть недоезжать. При левом хвате — наоборот.
                </div>
                <button
                  onClick={() => setGripInfoOpen(false)}
                  style={{
                    marginTop: 18, width: '100%', padding: '10px 0',
                    fontSize: 14, fontWeight: 600, background: ACCENT,
                    color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer',
                  }}
                >
                  Понятно
                </button>
              </div>
            </div>
          )}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              border: `1px solid ${PANEL_BORDER}`,
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            <GripOption
              label="Правый"
              active={grip === 'right'}
              disabled={savingGrip}
              divider
              onClick={() => { if (grip !== 'right') saveGrip('right'); }}
            />
            <GripOption
              label="Левый"
              active={grip === 'left'}
              disabled={savingGrip}
              onClick={() => { if (grip !== 'left') saveGrip('left'); }}
            />
          </div>
        </div>
      </div>

      {/* Logout */}
      <div style={{ padding: '4px 16px 0' }}>
        <button
          onClick={() => void logout()}
          style={{
            width: '100%',
            padding: '14px 0',
            fontSize: 16,
            fontWeight: 600,
            background: PANEL,
            color: ACCENT,
            border: `1px solid ${PANEL_BORDER}`,
            borderRadius: 16,
            cursor: 'pointer',
          }}
        >
          Выйти
        </button>
      </div>
    </main>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        borderBottom: last ? 'none' : `1px solid ${PANEL_BORDER}`,
      }}
    >
      <span style={{ fontSize: 14, color: MUTED }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 500, color: TEXT }}>{value}</span>
    </div>
  );
}

function GripOption({
  label,
  active,
  disabled,
  divider,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  divider?: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '10px 0',
        fontSize: 15,
        fontWeight: active ? 700 : 400,
        background: active ? ACCENT : PANEL,
        borderRight: divider ? `1px solid ${PANEL_BORDER}` : 'none',
        color: active ? '#ffffff' : MUTED,
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s, color 0.15s',
      }}
    >
      {label}
    </button>
  );
}
