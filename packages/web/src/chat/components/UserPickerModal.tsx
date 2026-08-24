import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { findOrCreateDM, searchUsers, type UserPickerItem } from '../api.js';
import { chatKeys } from '../../lib/queryKeys.js';
import { UserAvatar } from './UserAvatar.js';
import { AccessibleModal } from '../../components/AccessibleModal.js';

interface UserPickerModalProps {
  open: boolean;
  onClose: () => void;
  onPicked: (chatId: string) => void;
}

export function UserPickerModal({
  open,
  onClose,
  onPicked,
}: UserPickerModalProps): JSX.Element | null {
  const [raw, setRaw] = useState('');
  const [query, setQuery] = useState('');
  const queryClient = useQueryClient();

  // Debounce 300ms.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setQuery(raw.trim()), 300);
    return () => window.clearTimeout(t);
  }, [raw, open]);

  const { data, isFetching } = useQuery<UserPickerItem[]>({
    queryKey: chatKeys.users(query),
    queryFn: () => searchUsers(query),
    enabled: open && query.length >= 1,
    staleTime: 60_000,
  });

  const { mutate: pick, isPending } = useMutation({
    mutationFn: (otherUserId: string) => findOrCreateDM(otherUserId),
    onSuccess: ({ chatId, created }) => {
      if (created) {
        // New chat — list cache is stale.
        void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
      }
      onPicked(chatId);
    },
  });

  if (!open) return null;

  return (
    <AccessibleModal
      open
      title="Новый чат"
      copy="Найдите игрока, чтобы начать личный диалог."
      onRequestClose={() => onClose()}
      cardStyle={{ width: 'min(400px, calc(100vw - 28px))', maxHeight: 'calc(100dvh - 40px)' }}
    >
      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          minHeight: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Search size={16} color="var(--muted)" />
          <input
            type="text"
            value={raw}
            autoFocus
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Поиск игроков..."
            aria-label="Поиск игроков"
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: 12,
              border: 'none',
              outline: 'none',
              background: 'rgba(255,255,255,0.72)',
              color: 'var(--ink)',
              fontSize: 14,
            }}
          />
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {query.length > 0 && isFetching && (
            <div style={{ padding: 12, fontSize: 12, color: 'var(--muted)' }}>
              Поиск...
            </div>
          )}
          {query.length > 0 && !isFetching && (data?.length ?? 0) === 0 && (
            <div style={{ padding: 12, fontSize: 12, color: 'var(--muted)' }}>
              Никого не нашли
            </div>
          )}
          {(data ?? []).map((u) => (
            <button
              type="button"
              key={u.userId}
              disabled={isPending}
              onClick={() => pick(u.userId)}
              className="glass"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderRadius: 14,
                color: 'var(--ink)',
                cursor: isPending ? 'wait' : 'pointer',
                textAlign: 'left',
              }}
            >
              <UserAvatar avatarUrl={u.avatarUrl} name={u.displayName} size={32} fontSize={13} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>{u.displayName}</span>
            </button>
          ))}
        </div>
      </div>
    </AccessibleModal>
  );
}
