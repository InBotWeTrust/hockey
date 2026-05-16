import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Info, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/apiFetch.js';
import { TelegramLoginButton, type TelegramAuthPayload } from '../auth/TelegramLoginButton.js';
import { useAuthStore, type AuthSession } from '../auth/authStore.js';
import { useLogout } from '../auth/useLogout.js';
import { startVkOAuth } from '../auth/vkAuth.js';
import type { ProfileData } from './profileTypes.js';

type DisplaySource = 'telegram' | 'vk' | 'custom';

const MB = 1024 * 1024;
const AVATAR_SOURCE_MAX_BYTES = 8 * MB;
const AVATAR_WEBP_MAX_BYTES = 2 * MB;
const AVATAR_SIZE = 512;
const avatarSourceTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const avatarWebpQualities = [0.86, 0.76, 0.66, 0.56];

function formatUploadLimit(bytes: number): string {
  return `${Math.round(bytes / MB)} МБ`;
}

function avatarFileName(file: File): string {
  const baseName = file.name.replace(/\.[^.]+$/, '').trim() || 'avatar';
  return `${baseName}.webp`;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось прочитать изображение.'));
    };
    image.src = url;
  });
}

function canvasToWebpBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/webp', quality);
  });
}

async function convertAvatarToWebp(file: File): Promise<File> {
  if (!avatarSourceTypes.has(file.type)) {
    throw new Error('Аватар должен быть изображением JPG, PNG или WebP.');
  }
  if (file.size > AVATAR_SOURCE_MAX_BYTES) {
    throw new Error(`Аватар слишком большой. Лимит: ${formatUploadLimit(AVATAR_SOURCE_MAX_BYTES)}.`);
  }

  const image = await loadImage(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const cropSize = Math.min(sourceWidth, sourceHeight);
  if (!Number.isFinite(cropSize) || cropSize <= 0) {
    throw new Error('Не удалось прочитать размер изображения.');
  }

  const canvas = document.createElement('canvas');
  const outputSize = Math.min(AVATAR_SIZE, cropSize);
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Браузер не смог подготовить аватар.');
  }
  const sx = Math.max(0, (sourceWidth - cropSize) / 2);
  const sy = Math.max(0, (sourceHeight - cropSize) / 2);
  ctx.drawImage(image, sx, sy, cropSize, cropSize, 0, 0, outputSize, outputSize);

  let lastBlob: Blob | null = null;
  for (const quality of avatarWebpQualities) {
    const blob = await canvasToWebpBlob(canvas, quality);
    if (!blob) continue;
    lastBlob = blob;
    if (blob.size <= AVATAR_WEBP_MAX_BYTES) {
      return new File([blob], avatarFileName(file), { type: 'image/webp' });
    }
  }

  if (!lastBlob) {
    throw new Error('Браузер не поддерживает сохранение WebP.');
  }
  throw new Error(`Не удалось сжать аватар до ${formatUploadLimit(AVATAR_WEBP_MAX_BYTES)}.`);
}

function providerName(data: ProfileData | undefined, source: DisplaySource): string {
  if (!data) return '-';
  if (source === 'custom') {
    return (
      [data.customFirstName, data.customLastName].filter(Boolean).join(' ') ||
      data.customDisplayName ||
      data.displayName ||
      '-'
    );
  }
  const first = source === 'telegram' ? data.tgFirstName : data.vkFirstName;
  const last = source === 'telegram' ? data.tgLastName : data.vkLastName;
  const username = source === 'telegram' ? (data.tgUsername ?? data.username) : data.vkUsername;
  return [first, last].filter(Boolean).join(' ') || username || '-';
}

function providerAvatar(data: ProfileData | undefined, source: DisplaySource): string | null {
  if (!data) return null;
  if (source === 'custom') return data.customAvatarUrl ?? null;
  return source === 'telegram' ? (data.tgAvatarUrl ?? null) : (data.vkAvatarUrl ?? null);
}

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function withLinkedProvider(
  providers: Array<'telegram' | 'vk'> | undefined,
  provider: 'telegram' | 'vk',
): Array<'telegram' | 'vk'> {
  if (providers?.includes(provider)) return providers;
  return [provider, ...(providers ?? [])];
}

export function ProfileSettingsScreen(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logout = useLogout();
  const setSession = useAuthStore((s) => s.setSession);
  const updateUser = useAuthStore((s) => s.updateUser);
  const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? '';

  const { data, isLoading } = useQuery<ProfileData>({
    queryKey: ['profile'],
    queryFn: () => apiFetch<ProfileData>('/me'),
  });

  const [grip, setGrip] = useState<'right' | 'left'>('right');
  const [customFirstName, setCustomFirstName] = useState('');
  const [customLastName, setCustomLastName] = useState('');
  const [gripInfoOpen, setGripInfoOpen] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [vkLinkPending, setVkLinkPending] = useState(false);

  useEffect(() => {
    if (data) {
      setGrip(data.grip);
      updateUser({
        grip: data.grip,
        displayName: data.displayName,
        ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
        ...(data.displaySource !== undefined ? { displaySource: data.displaySource } : {}),
        ...(data.linkedProviders !== undefined ? { linkedProviders: data.linkedProviders } : {}),
        ...(data.customDisplayName !== undefined
          ? { customDisplayName: data.customDisplayName }
          : {}),
        ...(data.customFirstName !== undefined ? { customFirstName: data.customFirstName } : {}),
        ...(data.customLastName !== undefined ? { customLastName: data.customLastName } : {}),
        ...(data.customAvatarUrl !== undefined ? { customAvatarUrl: data.customAvatarUrl } : {}),
      });
      setCustomFirstName(data.customFirstName ?? '');
      setCustomLastName(data.customLastName ?? '');
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

  const { mutate: saveDisplaySource, isPending: savingDisplaySource } = useMutation<
    ProfileData,
    Error,
    DisplaySource,
    { previous?: ProfileData }
  >({
    mutationFn: (displaySource) =>
      apiFetch<ProfileData>('/me', {
        method: 'PATCH',
        body: JSON.stringify({ displaySource }),
      }),
    onMutate: (displaySource) => {
      setSourceError(null);
      const previous = queryClient.getQueryData<ProfileData>(['profile']);
      queryClient.setQueryData<ProfileData>(['profile'], (old) => {
        if (!old) return old;
        const nextName = providerName(old, displaySource);
        const nextAvatar = providerAvatar(old, displaySource);
        return {
          ...old,
          displaySource,
          displayName: nextName === '-' ? old.displayName : nextName,
          avatarUrl: nextAvatar,
        };
      });
      return previous ? { previous } : {};
    },
    onSuccess: (profile) => {
      queryClient.setQueryData<ProfileData>(['profile'], profile);
      updateUser({
        displayName: profile.displayName,
        ...(profile.avatarUrl !== undefined ? { avatarUrl: profile.avatarUrl } : {}),
        ...(profile.displaySource !== undefined ? { displaySource: profile.displaySource } : {}),
        ...(profile.linkedProviders !== undefined
          ? { linkedProviders: profile.linkedProviders }
          : {}),
        ...(profile.customDisplayName !== undefined
          ? { customDisplayName: profile.customDisplayName }
          : {}),
        ...(profile.customFirstName !== undefined
          ? { customFirstName: profile.customFirstName }
          : {}),
        ...(profile.customLastName !== undefined ? { customLastName: profile.customLastName } : {}),
        ...(profile.customAvatarUrl !== undefined
          ? { customAvatarUrl: profile.customAvatarUrl }
          : {}),
      });
    },
    onError: (err, _source, context) => {
      if (context?.previous) {
        queryClient.setQueryData<ProfileData>(['profile'], context.previous);
      }
      setSourceError(err.message);
    },
  });

  const { mutate: saveCustomProfile, isPending: savingCustomProfile } = useMutation<
    ProfileData,
    Error,
    { firstName: string; lastName: string }
  >({
    mutationFn: ({ firstName, lastName }) =>
      apiFetch<ProfileData>('/me', {
        method: 'PATCH',
        body: JSON.stringify({
          displaySource: 'custom',
          customFirstName: firstName,
          customLastName: lastName,
        }),
      }),
    onSuccess: (profile) => {
      queryClient.setQueryData<ProfileData>(['profile'], profile);
      updateUser({
        displayName: profile.displayName,
        ...(profile.avatarUrl !== undefined ? { avatarUrl: profile.avatarUrl } : {}),
        ...(profile.displaySource !== undefined ? { displaySource: profile.displaySource } : {}),
        ...(profile.customDisplayName !== undefined
          ? { customDisplayName: profile.customDisplayName }
          : {}),
        ...(profile.customFirstName !== undefined
          ? { customFirstName: profile.customFirstName }
          : {}),
        ...(profile.customLastName !== undefined ? { customLastName: profile.customLastName } : {}),
        ...(profile.customAvatarUrl !== undefined
          ? { customAvatarUrl: profile.customAvatarUrl }
          : {}),
      });
      setSourceError(null);
    },
    onError: (err) => {
      setSourceError(err.message);
    },
  });

  const uploadAvatar = useMutation<
    { avatarUrl: string; customAvatarUrl: string; displaySource: 'custom' },
    Error,
    File
  >({
    mutationFn: async (file) => {
      const avatar = await convertAvatarToWebp(file);
      return apiFetch<{ avatarUrl: string; customAvatarUrl: string; displaySource: 'custom' }>(
        '/me/avatar',
        {
          method: 'POST',
          headers: {
            'Content-Type': avatar.type,
            'X-File-Name': avatar.name,
          },
          body: avatar,
        },
      );
    },
    onSuccess: (uploaded) => {
      queryClient.setQueryData<ProfileData>(['profile'], (old) =>
        old
          ? {
              ...old,
              avatarUrl: uploaded.avatarUrl,
              customAvatarUrl: uploaded.customAvatarUrl,
              displaySource: 'custom',
            }
          : old,
      );
      updateUser({
        avatarUrl: uploaded.avatarUrl,
        customAvatarUrl: uploaded.customAvatarUrl,
        displaySource: 'custom',
      });
      setSourceError(null);
    },
    onError: (err) => {
      setSourceError(err.message);
    },
  });

  const { mutate: linkTelegram, isPending: telegramLinkPending } = useMutation<
    AuthSession,
    Error,
    TelegramAuthPayload
  >({
    mutationFn: (payload) =>
      apiFetch<AuthSession>('/auth/telegram', {
        method: 'POST',
        body: JSON.stringify({ ...payload, timezone: detectTimezone() }),
      }),
    onSuccess: (session) => {
      const currentUser = useAuthStore.getState().user;
      setSession({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        user: currentUser ? { ...currentUser, ...session.user } : session.user,
      });
      queryClient.setQueryData<ProfileData>(['profile'], (old) => {
        if (!old) return old;
        return { ...old, linkedProviders: withLinkedProvider(old.linkedProviders, 'telegram') };
      });
      updateUser({
        linkedProviders: withLinkedProvider(currentUser?.linkedProviders, 'telegram'),
      });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (err) => {
      setSourceError(err.message);
    },
  });

  const linkedProviders = data?.linkedProviders ?? ['telegram'];
  const displaySource = data?.displaySource ?? 'telegram';
  const trimmedCustomFirstName = customFirstName.trim();
  const trimmedCustomLastName = customLastName.trim();
  const canSaveCustomProfile =
    trimmedCustomFirstName.length > 0 &&
    trimmedCustomLastName.length > 0 &&
    !savingDisplaySource &&
    !savingCustomProfile &&
    !uploadAvatar.isPending;

  return (
    <main
      className="screen"
      style={{
        paddingTop: 'var(--app-safe-top)',
        paddingBottom: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          margin: '10px 12px 10px',
        }}
      >
        <button
          type="button"
          className="icon-btn glass"
          aria-label="Назад"
          onClick={() => navigate('/profile')}
          style={{
            width: 40,
            height: 40,
            minWidth: 40,
            minHeight: 40,
            borderRadius: 999,
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <ArrowLeft size={16} />
        </button>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Настройки</div>
      </div>

      {isLoading ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Загрузка...
        </div>
      ) : (
        <>
          <div className="section-label" style={{ marginBottom: 6 }}>
            Аккаунт
          </div>
          <div style={{ margin: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ProfileSourceOption
              label="Кастом"
              name={providerName(data, 'custom')}
              avatarUrl={providerAvatar(data, 'custom')}
              active={displaySource === 'custom'}
              disabled={savingDisplaySource || savingCustomProfile || uploadAvatar.isPending}
              onClick={() => {
                if (displaySource === 'custom') return;
                if (!canSaveCustomProfile) {
                  setSourceError('Укажите имя и фамилию для кастомного профиля.');
                  return;
                }
                saveCustomProfile({
                  firstName: trimmedCustomFirstName,
                  lastName: trimmedCustomLastName,
                });
              }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input
                aria-label="Кастомное имя"
                value={customFirstName}
                onChange={(event) => setCustomFirstName(event.target.value)}
                placeholder="Имя"
                maxLength={60}
                style={{
                  minWidth: 0,
                  height: 46,
                  borderRadius: 16,
                  border: '1px solid rgba(255,255,255,0.78)',
                  background: 'rgba(248, 252, 255, 0.68)',
                  padding: '0 14px',
                  color: 'var(--ink)',
                  font: 'inherit',
                  fontSize: 14,
                  fontWeight: 700,
                  outline: 'none',
                }}
              />
              <input
                aria-label="Кастомная фамилия"
                value={customLastName}
                onChange={(event) => setCustomLastName(event.target.value)}
                placeholder="Фамилия"
                maxLength={60}
                style={{
                  minWidth: 0,
                  height: 46,
                  borderRadius: 16,
                  border: '1px solid rgba(255,255,255,0.78)',
                  background: 'rgba(248, 252, 255, 0.68)',
                  padding: '0 14px',
                  color: 'var(--ink)',
                  font: 'inherit',
                  fontSize: 14,
                  fontWeight: 700,
                  outline: 'none',
                }}
              />
            </div>
            <button
              type="button"
              className="btn btn--cta"
              disabled={!canSaveCustomProfile}
              onClick={() =>
                saveCustomProfile({
                  firstName: trimmedCustomFirstName,
                  lastName: trimmedCustomLastName,
                })
              }
              style={{ justifyContent: 'center', padding: '11px 0', fontSize: 13 }}
            >
              {savingCustomProfile ? 'Сохраняем...' : 'Сохранить кастомный профиль'}
            </button>
            <label
              className="btn btn--ghost"
              style={{
                justifyContent: 'center',
                padding: '11px 0',
                fontSize: 13,
                cursor: uploadAvatar.isPending ? 'wait' : 'pointer',
              }}
            >
              {uploadAvatar.isPending ? 'Загружаем...' : 'Загрузить аватар'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                disabled={uploadAvatar.isPending}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = '';
                  if (file) {
                    setSourceError(null);
                    uploadAvatar.mutate(file);
                  }
                }}
              />
            </label>
            <ProfileSourceOption
              label="Из Telegram"
              name={providerName(data, 'telegram')}
              avatarUrl={providerAvatar(data, 'telegram')}
              active={displaySource === 'telegram'}
              disabled={savingDisplaySource || !linkedProviders.includes('telegram')}
              onClick={() => {
                if (displaySource !== 'telegram' && linkedProviders.includes('telegram')) {
                  saveDisplaySource('telegram');
                }
              }}
            />
            <ProfileSourceOption
              label="Из ВКонтакте"
              name={providerName(data, 'vk')}
              avatarUrl={providerAvatar(data, 'vk')}
              active={displaySource === 'vk'}
              disabled={savingDisplaySource || !linkedProviders.includes('vk')}
              onClick={() => {
                if (displaySource !== 'vk' && linkedProviders.includes('vk')) {
                  saveDisplaySource('vk');
                }
              }}
            />
            {!linkedProviders.includes('vk') && (
              <button
                type="button"
                className="btn btn--ghost"
                disabled={vkLinkPending}
                onClick={async () => {
                  setSourceError(null);
                  setVkLinkPending(true);
                  try {
                    await startVkOAuth();
                  } catch (err) {
                    setVkLinkPending(false);
                    setSourceError(
                      err instanceof Error ? err.message : 'Ошибка привязки ВКонтакте',
                    );
                  }
                }}
                style={{ justifyContent: 'center', padding: '11px 0', fontSize: 13 }}
              >
                Привязать ВКонтакте
              </button>
            )}
            {!linkedProviders.includes('telegram') && (
              <div
                className="glass"
                style={{
                  padding: '12px 10px',
                  borderRadius: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
                  Привязать Telegram
                </div>
                <TelegramLoginButton
                  botUsername={botUsername}
                  cornerRadius={12}
                  size="medium"
                  onAuth={(payload) => {
                    setSourceError(null);
                    linkTelegram(payload);
                  }}
                />
                {telegramLinkPending && (
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Привязываем...</div>
                )}
              </div>
            )}
            {sourceError && (
              <div
                role="alert"
                style={{ fontSize: 12, color: 'var(--red-deep)', textAlign: 'center' }}
              >
                {sourceError}
              </div>
            )}
          </div>

          <div
            className="section-label"
            style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span>Хват игрока</span>
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
        </>
      )}

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
              При правом хвате можно бросить вплотную у правого борта - слева шайба не докатится.
              При левом - наоборот.
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

interface ProfileSourceOptionProps {
  label: string;
  name: string;
  avatarUrl: string | null;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}

function ProfileSourceOption({
  label,
  name,
  avatarUrl,
  active,
  disabled,
  onClick,
}: ProfileSourceOptionProps): JSX.Element {
  const initial = name !== '-' ? name.charAt(0).toUpperCase() : '?';
  return (
    <button
      type="button"
      className={active ? 'glass-dark' : 'glass'}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '12px 14px',
        borderRadius: 16,
        display: 'grid',
        gridTemplateColumns: '40px 1fr auto',
        alignItems: 'center',
        gap: 10,
        opacity: disabled && !active ? 0.55 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        textAlign: 'left',
      }}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          aria-hidden
          style={{ width: 40, height: 40, borderRadius: 999, objectFit: 'cover' }}
        />
      ) : (
        <span
          aria-hidden
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            background: active ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.08)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
          }}
        >
          {initial}
        </span>
      )}
      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>{label}</span>
        <span
          style={{
            fontSize: 12,
            opacity: 0.75,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {name}
        </span>
      </span>
      <span
        aria-hidden
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          border: active ? '5px solid currentColor' : '2px solid currentColor',
          opacity: active ? 1 : 0.35,
        }}
      />
    </button>
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

function GripOption({
  label,
  hint,
  active,
  disabled,
  sprite,
  side,
  onClick,
}: GripOptionProps): JSX.Element {
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
      <div
        style={{
          position: 'relative',
          width: SIZE,
          height: SIZE,
          transform: `rotate(${side === 'left' ? -18.3 : 18.3}deg)`,
        }}
      >
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
