import { memo } from 'react';
import type { ChatDTO } from '../api.js';
import { useAuthStore } from '../../auth/authStore.js';

interface ChatListItemProps {
  chat: ChatDTO;
  onOpen: (chatId: string) => void;
}

const PREVIEW_LIMIT = 28;

function formatAuthor(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return '';
  const first = parts[0] ?? '';
  if (parts.length === 1) return first;
  const lastInitial = (parts[parts.length - 1] ?? '').charAt(0).toUpperCase();
  return lastInitial ? `${first} ${lastInitial}` : first;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

function displayTitle(chat: ChatDTO): string {
  if (chat.type === 'direct') {
    return chat.dmCounterpart?.displayName ?? 'Диалог';
  }
  return chat.name ?? (chat.type === 'system' ? 'Системный канал' : 'Чат');
}

function lastMessagePreview(chat: ChatDTO, meId: string | null): string {
  const m = chat.lastMessage;
  if (!m) return 'Нет сообщений';
  if (m.isDeleted) return 'Сообщение удалено';
  const isMine = meId !== null && m.senderId === meId;
  const author = isMine
    ? 'Вы'
    : chat.lastMessageSenderName
      ? formatAuthor(chat.lastMessageSenderName)
      : '';
  const body = truncate(m.content, PREVIEW_LIMIT);
  return author ? `${author}: ${body}` : body;
}

function avatarInitial(chat: ChatDTO): string {
  const title = displayTitle(chat);
  return (title || '?').charAt(0).toUpperCase();
}

function ChatListItemImpl({ chat, onOpen }: ChatListItemProps): JSX.Element {
  const meId = useAuthStore((s) => s.user?.id ?? null);
  const isSystem = chat.type === 'system';
  const avatarUrl = chat.dmCounterpart?.avatarUrl ?? null;
  const unread = chat.unreadCount;

  return (
    <button
      type="button"
      className="glass"
      onClick={() => onOpen(chat.id)}
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: '40px 1fr auto',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '12px 14px',
        borderRadius: 20,
        textAlign: 'left',
        cursor: 'pointer',
        color: 'var(--ink)',
        overflow: 'hidden',
      }}
    >
      {isSystem && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 8,
            bottom: 8,
            width: 4,
            borderTopRightRadius: 4,
            borderBottomRightRadius: 4,
            background: 'var(--blue-accent)',
          }}
        />
      )}

      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
        />
      ) : (
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            fontWeight: 800,
          }}
        >
          {avatarInitial(chat)}
        </div>
      )}

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--ink)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {displayTitle(chat)}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--muted)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {lastMessagePreview(chat, meId)}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 4,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>{formatTime(chat.lastMessageAt)}</span>
        {unread > 0 && (
          <span
            className="pill pill--dark"
            style={{
              fontSize: 11,
              padding: '3px 9px',
              minWidth: 22,
              justifyContent: 'center',
              background: 'rgb(220, 38, 38)',
              borderColor: 'rgb(220, 38, 38)',
            }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </div>
    </button>
  );
}

export const ChatListItem = memo(ChatListItemImpl);
