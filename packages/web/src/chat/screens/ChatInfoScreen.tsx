import { useRef, useState, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { fetchChatInfo, type ChatInfoDTO, type UserPickerItem } from '../api.js';
import { resetAdminChatAvatar, uploadAdminChatAvatar } from '../../admin/api.js';
import { useAuthStore } from '../../auth/authStore.js';
import { chatKeys } from '../../lib/queryKeys.js';
import { convertChatAvatarToWebp } from '../../lib/chatAvatarImage.js';
import { UserAvatar } from '../components/UserAvatar.js';
import { UserProfileSheet } from '../components/UserProfileSheet.js';

function formatMemberCount(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} участник`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} участника`;
  return `${n} участников`;
}

function chatTitle(info: ChatInfoDTO): string {
  return info.name ?? (info.type === 'system' ? 'Системный канал' : 'Чат');
}

export function ChatInfoScreen(): JSX.Element {
  const params = useParams<{ chatId: string }>();
  const chatId = params.chatId ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [previewSender, setPreviewSender] = useState<UserPickerItem | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<ChatInfoDTO>({
    queryKey: chatKeys.info(chatId),
    queryFn: () => fetchChatInfo(chatId),
    enabled: chatId.length > 0,
    staleTime: 30_000,
  });
  const canManageAvatar =
    me?.role === 'admin' &&
    data !== undefined &&
    (data.type === 'channel' || data.type === 'system');
  const avatarLabel = data?.type === 'channel' ? 'аватар канала' : 'аватар чата';
  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const webp = await convertChatAvatarToWebp(file);
      return uploadAdminChatAvatar(chatId, webp);
    },
    onSuccess: async () => {
      setAvatarError(null);
      await queryClient.invalidateQueries({ queryKey: chatKeys.list() });
      await refetch();
    },
    onError: (err) => {
      setAvatarError(err instanceof Error ? err.message : 'Не удалось загрузить аватар.');
    },
  });
  const resetAvatarMutation = useMutation({
    mutationFn: () => resetAdminChatAvatar(chatId),
    onSuccess: async () => {
      setAvatarError(null);
      await queryClient.invalidateQueries({ queryKey: chatKeys.list() });
      await refetch();
    },
    onError: (err) => {
      setAvatarError(err instanceof Error ? err.message : 'Не удалось сбросить аватар.');
    },
  });

  const onAvatarFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setAvatarError(null);
    uploadAvatarMutation.mutate(file);
  };

  return (
    <main
      className="screen"
      style={{
        height: '100%',
        minHeight: 0,
        paddingTop: 'var(--app-safe-top)',
        paddingBottom: 24,
        overflowY: 'auto',
        overscrollBehaviorY: 'contain',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {isLoading && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Загрузка...
        </div>
      )}
      {isError && (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 8 }}>
            Не удалось загрузить
          </div>
          <button type="button" className="btn btn--ghost" onClick={() => void refetch()}>
            Повторить
          </button>
        </div>
      )}

      {data && (
        <>
          <div
            className="glass"
            style={{
              position: 'relative',
              margin: '12px 14px',
              padding: '26px 16px 16px',
              borderRadius: 20,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              gap: 8,
            }}
          >
            <button
              type="button"
              className="icon-btn"
              aria-label="Назад"
              onClick={() => navigate(-1)}
              style={{
                position: 'absolute',
                top: 12,
                left: 12,
                width: 40,
                height: 40,
                minWidth: 40,
                minHeight: 40,
                borderRadius: 999,
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ArrowLeft size={16} />
            </button>
            <UserAvatar
              avatarUrl={data.avatarUrl}
              name={chatTitle(data)}
              size={72}
              alt={data.avatarUrl ? chatTitle(data) : ''}
            />
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>
              {chatTitle(data)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {formatMemberCount(data.memberCount)}
            </div>
            {data.description && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 13,
                  color: 'var(--ink)',
                  whiteSpace: 'pre-wrap',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                {data.description}
              </div>
            )}
            {canManageAvatar && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  width: '100%',
                  marginTop: 8,
                }}
              >
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={onAvatarFileChange}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  className="btn btn--cta"
                  disabled={uploadAvatarMutation.isPending || resetAvatarMutation.isPending}
                  onClick={() => avatarInputRef.current?.click()}
                  style={{ width: '100%' }}
                >
                  {uploadAvatarMutation.isPending ? 'Загружаю...' : `Загрузить ${avatarLabel}`}
                </button>
                {data.avatarUrl && (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={uploadAvatarMutation.isPending || resetAvatarMutation.isPending}
                    onClick={() => resetAvatarMutation.mutate()}
                    style={{ width: '100%' }}
                  >
                    {resetAvatarMutation.isPending ? 'Сбрасываю...' : 'Сбросить аватар'}
                  </button>
                )}
                {avatarError && (
                  <div style={{ fontSize: 12, color: 'rgb(220, 38, 38)', textAlign: 'left' }}>
                    {avatarError}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ padding: '4px 14px 0', fontSize: 12, color: 'var(--muted)' }}>
            Участники
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: '8px 14px',
            }}
          >
            {data.members.map((m) => (
              <button
                key={m.userId}
                type="button"
                className="glass"
                onClick={() =>
                  setPreviewSender({
                    userId: m.userId,
                    displayName: m.displayName,
                    avatarUrl: m.avatarUrl,
                  })
                }
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 1fr',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 16,
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: 'var(--ink)',
                }}
              >
                <UserAvatar avatarUrl={m.avatarUrl} name={m.displayName} size={40} />
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {m.displayName}
                </div>
              </button>
            ))}
            {data.memberCount > data.members.length && (
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--muted)',
                  textAlign: 'center',
                  padding: '8px 0',
                }}
              >
                и ещё {data.memberCount - data.members.length}…
              </div>
            )}
          </div>
        </>
      )}
      <UserProfileSheet sender={previewSender} onClose={() => setPreviewSender(null)} />
    </main>
  );
}
