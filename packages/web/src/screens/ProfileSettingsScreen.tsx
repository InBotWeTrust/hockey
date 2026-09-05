import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Info, LogOut, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/apiFetch.js';
import { useAuthStore } from '../auth/authStore.js';
import { useLogout } from '../auth/useLogout.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { triggerHaptic } from '../feedback/haptics.js';
import { ProfileSupportSections } from './ProfileSupportSections.js';
import type { ProfileData } from './profileTypes.js';

export function ProfileSettingsScreen(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logout = useLogout();
  const updateUser = useAuthStore((state) => state.updateUser);
  const { data, isLoading } = useQuery<ProfileData>({
    queryKey: ['profile'],
    queryFn: () => apiFetch<ProfileData>('/me'),
  });
  const [grip, setGrip] = useState<'right' | 'left'>('right');
  const [gripInfoOpen, setGripInfoOpen] = useState(false);

  useEffect(() => {
    if (!data) return;
    setGrip(data.grip);
    updateUser({
      grip: data.grip,
      displayName: data.displayName,
      ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
    });
  }, [data, updateUser]);

  const { mutate: saveGrip, isPending: savingGrip } = useMutation({
    mutationFn: (nextGrip: 'right' | 'left') =>
      apiFetch<{ grip: string }>('/me', {
        method: 'PATCH',
        body: JSON.stringify({ grip: nextGrip }),
      }),
    onMutate: (nextGrip) => {
      setGrip(nextGrip);
      updateUser({ grip: nextGrip });
    },
    onSuccess: (_response, nextGrip) => {
      triggerHaptic('success');
      queryClient.setQueryData<ProfileData>(['profile'], (current) =>
        current ? { ...current, grip: nextGrip } : current,
      );
    },
    onError: () => {
      triggerHaptic('error');
      if (data) {
        setGrip(data.grip);
        updateUser({ grip: data.grip });
      }
    },
  });

  const registrationProvider =
    data?.registrationProvider ?? (data?.displaySource === 'vk' ? 'vk' : 'telegram');
  const providerLabel = registrationProvider === 'vk' ? 'ВКонтакте' : 'Telegram';
  const accountName =
    registrationProvider === 'vk'
      ? [data?.vkFirstName, data?.vkLastName].filter(Boolean).join(' ') || data?.displayName || '—'
      : [data?.tgFirstName, data?.tgLastName].filter(Boolean).join(' ') || data?.displayName || '—';
  const accountAvatar =
    registrationProvider === 'vk'
      ? (data?.vkAvatarUrl ?? data?.avatarUrl ?? null)
      : (data?.tgAvatarUrl ?? data?.avatarUrl ?? null);
  const accountId = data?.registrationProviderId ?? data?.id ?? '—';
  const accountIdLabel = registrationProvider === 'vk' ? 'VK ID' : 'TG ID';

  return (
    <main className="screen" style={{ paddingTop: 'var(--app-safe-top)', paddingBottom: 16 }}>
      <div className="profile-settings-header">
        <button
          type="button"
          className="icon-btn icon-btn--page-back"
          aria-label="Назад"
          onClick={() => navigate('/profile')}
        >
          <ArrowLeft size={16} />
        </button>
        <h1 className="screen-title-on-arena">Настройки</h1>
      </div>

      {isLoading ? (
        <div className="profile-settings-loading">Загрузка...</div>
      ) : (
        <>
          <div className="section-label">Аккаунт</div>
          <div
            className="profile-registration-account glass"
            aria-label={`Аккаунт ${providerLabel}`}
          >
            {accountAvatar ? (
              <img src={accountAvatar} alt="" aria-hidden />
            ) : (
              <span className="profile-registration-account__avatar" aria-hidden>
                {accountName.charAt(0).toUpperCase() || '?'}
              </span>
            )}
            <span className="profile-registration-account__copy">
              <strong>{accountName}</strong>
              <span>
                {accountIdLabel} {accountId}
              </span>
            </span>
          </div>

          <div className="section-label profile-settings-grip-label">
            <span>Хват игрока</span>
            <button
              type="button"
              className="profile-settings-grip-info"
              onClick={() => setGripInfoOpen(true)}
              aria-label="О хвате"
            >
              <Info size={14} />
            </button>
          </div>
          <div className="profile-settings-grip-options">
            <GripOption
              label="Левый"
              hint="Шайба слева"
              active={grip === 'left'}
              disabled={savingGrip}
              sprite="/sprites/ultimate-player-left.webp"
              imageShiftX={-8}
              onClick={() => grip !== 'left' && saveGrip('left')}
            />
            <GripOption
              label="Правый"
              hint="Шайба справа"
              active={grip === 'right'}
              disabled={savingGrip}
              sprite="/sprites/ultimate-player-right.webp"
              imageShiftX={8}
              onClick={() => grip !== 'right' && saveGrip('right')}
            />
          </div>

          <ProfileSupportSections profileReady={data !== undefined} />

          <div className="profile-logout-wrap">
            <button
              type="button"
              className="glass profile-logout-btn profile-logout-btn--danger"
              onClick={() => void logout()}
            >
              <LogOut size={16} />
              Выйти
            </button>
          </div>
        </>
      )}

      {gripInfoOpen && (
        <AccessibleModal
          title="Хват клюшки"
          onRequestClose={() => setGripInfoOpen(false)}
          backdropStyle={{ zIndex: 250 }}
          cardStyle={{ maxWidth: 320 }}
          headerAction={
            <button
              type="button"
              className="icon-btn"
              aria-label="Закрыть подсказку"
              onClick={() => setGripInfoOpen(false)}
            >
              <X size={15} />
            </button>
          }
        >
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
            При правом хвате можно бросить вплотную у правого борта - слева шайба не докатится. При
            левом - наоборот.
          </div>
        </AccessibleModal>
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
  imageShiftX: number;
  onClick: () => void;
}

function GripOption({
  label,
  hint,
  active,
  disabled,
  sprite,
  imageShiftX,
  onClick,
}: GripOptionProps): JSX.Element {
  const size = 104;
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
      <div
        style={{
          position: 'relative',
          width: size,
          height: 86,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'visible',
        }}
      >
        <img
          src={sprite}
          alt=""
          aria-hidden
          style={{
            width: size,
            height: 86,
            display: 'block',
            objectFit: 'contain',
            transform: `translateX(${imageShiftX}px)`,
            filter: active
              ? 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.3))'
              : 'drop-shadow(0 1px 3px rgba(15, 23, 42, 0.15))',
          }}
        />
      </div>
      <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 10, opacity: 0.7 }}>{hint}</span>
    </button>
  );
}
