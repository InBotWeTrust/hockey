import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Search, Trash2, Upload, UserPlus, X } from 'lucide-react';
import {
  addGroupChatMembers,
  fetchChatInfo,
  removeGroupChatMember,
  searchUsers,
  type ChatInfoDTO,
  type UserPickerItem,
} from '../api.js';
import {
  patchAdminChatProfile,
  resetAdminChatAvatar,
  uploadAdminChatAvatar,
} from '../../admin/api.js';
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
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [memberAddOpen, setMemberAddOpen] = useState(false);
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
    (data.type === 'channel' || data.type === 'system' || data.type === 'group');
  const canManageGroup = me?.role === 'admin' && data?.type === 'group';
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
  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => removeGroupChatMember(chatId, userId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: chatKeys.list() });
      await refetch();
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
                  justifyContent: 'center',
                  gap: 8,
                  marginTop: 8,
                }}
              >
                {canManageGroup && (
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setProfileEditOpen(true)}
                    aria-label="Редактировать чат"
                    title="Редактировать чат"
                    style={{ width: 38, height: 38, minWidth: 38, minHeight: 38 }}
                  >
                    <Pencil size={16} />
                  </button>
                )}
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={onAvatarFileChange}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  className="icon-btn"
                  disabled={uploadAvatarMutation.isPending || resetAvatarMutation.isPending}
                  onClick={() => avatarInputRef.current?.click()}
                  aria-label={`Загрузить ${avatarLabel}`}
                  title={`Загрузить ${avatarLabel}`}
                  style={{ width: 38, height: 38, minWidth: 38, minHeight: 38 }}
                >
                  <Upload size={16} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  disabled={
                    !data.avatarUrl ||
                    uploadAvatarMutation.isPending ||
                    resetAvatarMutation.isPending
                  }
                  onClick={() => resetAvatarMutation.mutate()}
                  aria-label={`Удалить ${avatarLabel}`}
                  title={`Удалить ${avatarLabel}`}
                  style={{ width: 38, height: 38, minWidth: 38, minHeight: 38 }}
                >
                  <Trash2 size={16} />
                </button>
                {canManageGroup && (
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setMemberAddOpen(true)}
                    aria-label="Добавить участников"
                    title="Добавить участников"
                    style={{ width: 38, height: 38, minWidth: 38, minHeight: 38 }}
                  >
                    <UserPlus size={16} />
                  </button>
                )}
              </div>
            )}
            {canManageAvatar && avatarError && (
              <div
                style={{
                  width: '100%',
                  fontSize: 12,
                  color: 'rgb(220, 38, 38)',
                  textAlign: 'left',
                }}
              >
                {avatarError}
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
            {data.members.map((m) => {
              const removable = canManageGroup && m.role !== 'admin' && m.userId !== me?.id;
              return (
                <div key={m.userId} style={{ position: 'relative' }}>
                  <button
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
                      gridTemplateColumns: '40px minmax(0, 1fr)',
                      alignItems: 'center',
                      gap: 12,
                      width: '100%',
                      padding: removable ? '10px 58px 10px 12px' : '10px 12px',
                      borderRadius: 16,
                      textAlign: 'left',
                      cursor: 'pointer',
                      color: 'var(--ink)',
                    }}
                  >
                    <UserAvatar avatarUrl={m.avatarUrl} name={m.displayName} size={40} />
                    <div
                      style={{
                        minWidth: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          minWidth: 0,
                          fontSize: 14,
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {m.displayName}
                      </span>
                      {m.role === 'admin' && (
                        <span
                          className="pill"
                          style={{
                            padding: '3px 8px',
                            fontSize: 10,
                            flexShrink: 0,
                            color: 'var(--ink)',
                          }}
                        >
                          админ
                        </span>
                      )}
                    </div>
                  </button>
                  {removable && (
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Удалить ${m.displayName} из чата`}
                      title={`Удалить ${m.displayName} из чата`}
                      disabled={removeMemberMutation.isPending}
                      onClick={() => removeMemberMutation.mutate(m.userId)}
                      style={{
                        position: 'absolute',
                        right: 10,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: 36,
                        height: 36,
                        minWidth: 36,
                        minHeight: 36,
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              );
            })}
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
          {canManageGroup && profileEditOpen && (
            <GroupChatProfileModal
              chat={data}
              onClose={() => setProfileEditOpen(false)}
              onSaved={async () => {
                setProfileEditOpen(false);
                await queryClient.invalidateQueries({ queryKey: chatKeys.list() });
                await refetch();
              }}
            />
          )}
          {canManageGroup && memberAddOpen && (
            <GroupMembersModal
              chatId={chatId}
              existingUserIds={data.members.map((member) => member.userId)}
              onClose={() => setMemberAddOpen(false)}
              onSaved={async () => {
                setMemberAddOpen(false);
                await queryClient.invalidateQueries({ queryKey: chatKeys.list() });
                await refetch();
              }}
            />
          )}
        </>
      )}
      <UserProfileSheet sender={previewSender} onClose={() => setPreviewSender(null)} />
    </main>
  );
}

interface GroupChatProfileModalProps {
  chat: ChatInfoDTO;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function GroupChatProfileModal({
  chat,
  onClose,
  onSaved,
}: GroupChatProfileModalProps): JSX.Element {
  const [name, setName] = useState(chat.name ?? '');
  const [description, setDescription] = useState(chat.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const saveMutation = useMutation({
    mutationFn: () =>
      patchAdminChatProfile(chat.id, {
        name: name.trim(),
        description: description.trim(),
      }),
    onSuccess: () => void onSaved(),
    onError: () => setError('Не удалось сохранить чат'),
  });
  const canSave = name.trim().length > 0 && !saveMutation.isPending;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{ alignItems: 'flex-start', paddingTop: 'calc(48px + var(--app-safe-top))' }}
    >
      <div
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(420px, calc(100vw - 28px))', display: 'grid', gap: 16 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div className="modal-title">Настройки чата</div>
            <div className="modal-copy">Название и описание группового чата.</div>
          </div>
          <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
        <label style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
          Название
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="Название чата"
            maxLength={80}
            style={modalInputStyle}
          />
        </label>
        <label style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
          Описание
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            aria-label="Описание чата"
            maxLength={500}
            rows={4}
            style={{ ...modalInputStyle, resize: 'vertical' }}
          />
        </label>
        {error && <div style={{ color: 'var(--red-deep)', fontSize: 12 }}>{error}</div>}
        <button
          type="button"
          className="modal-primary btn--cta"
          disabled={!canSave}
          onClick={() => saveMutation.mutate()}
        >
          Сохранить
        </button>
      </div>
    </div>
  );
}

interface GroupMembersModalProps {
  chatId: string;
  existingUserIds: string[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function GroupMembersModal({
  chatId,
  existingUserIds,
  onClose,
  onSaved,
}: GroupMembersModalProps): JSX.Element {
  const [raw, setRaw] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<UserPickerItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const existing = new Set(existingUserIds);
  const selectedIds = new Set(selected.map((user) => user.userId));

  useEffect(() => {
    const t = window.setTimeout(() => setQuery(raw.trim()), 300);
    return () => window.clearTimeout(t);
  }, [raw]);

  const users = useQuery<UserPickerItem[]>({
    queryKey: chatKeys.users(query),
    queryFn: () => searchUsers(query),
    enabled: query.length >= 1,
    staleTime: 60_000,
  });
  const addMutation = useMutation({
    mutationFn: () =>
      addGroupChatMembers(
        chatId,
        selected.map((user) => user.userId),
      ),
    onSuccess: () => void onSaved(),
    onError: () => setError('Не удалось добавить участников'),
  });

  function toggleUser(user: UserPickerItem): void {
    if (existing.has(user.userId)) return;
    setSelected((current) =>
      current.some((item) => item.userId === user.userId)
        ? current.filter((item) => item.userId !== user.userId)
        : [...current, user],
    );
  }

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{ alignItems: 'flex-start', paddingTop: 'calc(48px + var(--app-safe-top))' }}
    >
      <div
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(420px, calc(100vw - 28px))', gap: 12 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div className="modal-title">Участники</div>
            <div className="modal-copy">Добавить игроков в групповой чат.</div>
          </div>
          <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <div className="chat-create-search">
            <Search size={14} color="var(--muted)" />
            <input
              className="chat-create-field chat-create-field--bare"
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              aria-label="Поиск новых участников"
              placeholder="Найти игрока"
            />
          </div>

          {selected.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {selected.map((user) => (
                <button
                  key={user.userId}
                  type="button"
                  className="pill"
                  onClick={() => toggleUser(user)}
                  style={{ border: 'none', cursor: 'pointer' }}
                >
                  {user.displayName} ×
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ maxHeight: 220, overflowY: 'auto', display: 'grid', gap: 8 }}>
          {query.length > 0 && users.isFetching && (
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Поиск...</div>
          )}
          {(users.data ?? []).map((user) => {
            const alreadyInChat = existing.has(user.userId);
            const picked = selectedIds.has(user.userId);
            return (
              <button
                key={user.userId}
                type="button"
                className={picked ? 'glass-dark' : 'glass'}
                disabled={alreadyInChat}
                onClick={() => toggleUser(user)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 12px',
                  borderRadius: 16,
                  color: picked ? '#ffffff' : 'var(--ink)',
                  textAlign: 'left',
                  cursor: alreadyInChat ? 'default' : 'pointer',
                  opacity: alreadyInChat ? 0.55 : 1,
                }}
              >
                <UserAvatar
                  avatarUrl={user.avatarUrl}
                  name={user.displayName}
                  size={32}
                  fontSize={13}
                />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 800 }}>{user.displayName}</span>
                <span style={{ fontSize: 12, color: picked ? '#ffffff' : 'var(--muted)' }}>
                  {alreadyInChat ? 'В чате' : picked ? 'Добавлен' : 'Добавить'}
                </span>
              </button>
            );
          })}
        </div>
        {error && <div style={{ color: 'var(--red-deep)', fontSize: 12 }}>{error}</div>}
        <button
          type="button"
          className="modal-primary btn--cta"
          disabled={selected.length === 0 || addMutation.isPending}
          onClick={() => addMutation.mutate()}
        >
          Добавить
        </button>
      </div>
    </div>
  );
}

const modalInputStyle: React.CSSProperties = {
  width: '100%',
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,0.85)',
  background: 'rgba(255,255,255,0.55)',
  padding: '12px 14px',
  font: 'inherit',
  fontWeight: 800,
  color: 'var(--ink)',
  outline: 'none',
};
