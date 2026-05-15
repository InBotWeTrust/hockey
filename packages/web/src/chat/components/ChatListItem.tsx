import { memo, useCallback } from 'react';
import { Megaphone, MessageSquareMore, Pin } from 'lucide-react';
import type { ChatDTO } from '../api.js';
import { useAuthStore } from '../../auth/authStore.js';
import { useLongPress } from '../useLongPress.js';
import { UserAvatar } from './UserAvatar.js';
import { stripRichTextSyntax } from '../richText.js';
import { chatAvatarUrl } from '../chatAvatar.js';

interface ChatListItemProps {
  chat: ChatDTO;
  onOpen: (chatId: string) => void;
  onRequestActions?: (chatId: string, anchorRect: DOMRect) => void;
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
  if (chat.type === 'channel') return chat.name ?? 'Канал';
  return chat.name ?? (chat.type === 'system' ? 'Системный канал' : 'Чат');
}

function lastMessagePreview(chat: ChatDTO, meId: string | null): string {
  const m = chat.lastMessage;
  if (!m) return 'Нет сообщений';
  if (m.isDeleted) return 'Сообщение удалено';
  if (chat.type === 'channel') {
    return truncate(stripRichTextSyntax(m.content), PREVIEW_LIMIT);
  }
  const isMine = meId !== null && m.senderId === meId;
  const author = isMine
    ? 'Вы'
    : chat.lastMessageSenderName
      ? formatAuthor(chat.lastMessageSenderName)
      : '';
  const body = truncate(m.content, PREVIEW_LIMIT);
  return author ? `${author}: ${body}` : body;
}

function ChatListItemImpl({ chat, onOpen, onRequestActions }: ChatListItemProps): JSX.Element {
  const meId = useAuthStore((s) => s.user?.id ?? null);
  const isSystem = chat.type === 'system';
  const isChannel = chat.type === 'channel';
  const isPinned = chat.pinnedAt !== null;
  const avatarUrl = chat.type === 'direct' ? (chat.dmCounterpart?.avatarUrl ?? null) : chatAvatarUrl(chat);
  const unread = chat.unreadCount;

  const onLongPress = useCallback(
    (rect: DOMRect) => {
      onRequestActions?.(chat.id, rect);
    },
    [onRequestActions, chat.id],
  );
  const longPressHandlers = useLongPress(onLongPress);

  return (
    <button
      type="button"
      className="glass"
      onClick={() => onOpen(chat.id)}
      {...longPressHandlers}
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
        // touch-action: manipulation prevents the long-press text-select
        // affordance on mobile while still letting native scroll handle the
        // list. Without it some browsers cancel the pointer sequence after
        // ~200ms and the long-press timer never fires.
        touchAction: 'manipulation',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {(isSystem || isChannel) && (
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
            background: isChannel ? 'rgb(220, 38, 38)' : 'var(--blue-accent)',
          }}
        />
      )}

      {isChannel || isSystem ? (
        <span
          className="glass-dark"
          aria-hidden
          style={{
            width: 40,
            height: 40,
            borderRadius: 14,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isChannel ? <Megaphone size={18} /> : <MessageSquareMore size={18} />}
        </span>
      ) : (
        <UserAvatar avatarUrl={avatarUrl} name={displayTitle(chat)} size={40} />
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {isPinned && (
            <Pin
              size={11}
              aria-label="Закреплено"
              style={{ color: 'var(--muted)', transform: 'rotate(45deg)' }}
            />
          )}
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>
            {formatTime(chat.lastMessageAt)}
          </span>
        </div>
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
