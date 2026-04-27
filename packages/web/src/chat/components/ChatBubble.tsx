import { memo } from 'react';
import type { ChatMessageDTO } from '../api.js';
import { ReplyPreview } from './ReplyPreview.js';
import { ReactionBar } from './ReactionBar.js';
import { useLongPress } from '../useLongPress.js';
import { UserAvatar } from './UserAvatar.js';

interface ChatBubbleProps {
  message: ChatMessageDTO;
  isOwn: boolean;
  // When true, foreign bubbles render an avatar + author name above the body.
  // DM chats keep the cleaner layout where the counterpart is shown in the
  // room header, not on every bubble.
  showAuthor?: boolean;
  replyTo?: { senderName: string; content: string } | null;
  onRequestActions: (message: ChatMessageDTO, anchorRect: DOMRect) => void;
  // Receives messageId so the parent can pass a stable useCallback reference
  // (without a per-bubble closure) — preserves React.memo across parent renders.
  onReact: (messageId: string, emoji: string) => void;
  // Foreign group/system bubbles call this when the user taps the avatar or
  // author name — parent opens a profile preview sheet. Optional: if undefined,
  // the avatar and name render as non-interactive plain elements.
  onOpenProfile?: (sender: { userId: string; displayName: string; avatarUrl: string | null }) => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function authorInitial(name: string | null): string {
  return (name?.trim() || '?').charAt(0).toUpperCase();
}

function ChatBubbleImpl({
  message,
  isOwn,
  showAuthor = false,
  replyTo,
  onRequestActions,
  onReact,
  onOpenProfile,
}: ChatBubbleProps): JSX.Element {
  const className = isOwn ? 'glass-dark' : 'glass';
  const align = isOwn ? 'flex-end' : 'flex-start';
  const radius = isOwn ? '20px 20px 4px 20px' : '20px 20px 20px 4px';
  const text = message.isDeleted ? 'Сообщение удалено' : message.content;
  const showAvatarAndName = showAuthor && !isOwn;

  const displayLabel = message.senderDisplayName ?? 'Участник';
  const senderForOpen = {
    userId: message.senderId,
    displayName: displayLabel,
    avatarUrl: message.senderAvatarUrl,
  };
  const canOpenProfile = onOpenProfile !== undefined && message.senderDisplayName !== null;
  const onAuthorClick = (): void => {
    if (canOpenProfile && onOpenProfile) onOpenProfile(senderForOpen);
  };
  const buttonReset = {
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: canOpenProfile ? 'pointer' : 'default',
    font: 'inherit',
    color: 'inherit',
    textAlign: 'left' as const,
  };

  const longPress = useLongPress(
    (rect) => {
      if (message.isDeleted) return;
      onRequestActions(message, rect);
    },
    { delayMs: 500 },
  );

  // Bubble body + author label + timestamp. Wrapped in a row layout (with
  // avatar) when showAvatarAndName is true; otherwise rendered directly so
  // the long-press handler stays on the first descendant <div> (existing
  // tests rely on that selector). Order of children matches the previous
  // shape when showAvatarAndName=false.
  const body = (
    <div
      {...longPress}
      style={{
        maxWidth: showAvatarAndName ? '100%' : '78%',
        touchAction: 'manipulation',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <div
        className={className}
        style={{
          padding: '8px 12px',
          borderRadius: radius,
          fontSize: 14,
          lineHeight: 1.4,
          color: isOwn ? '#ffffff' : 'var(--ink)',
          wordBreak: 'break-word',
          opacity: message.isDeleted ? 0.6 : 1,
          fontStyle: message.isDeleted ? 'italic' : 'normal',
        }}
      >
        {showAvatarAndName && (
          <button
            type="button"
            disabled={!canOpenProfile}
            onClick={onAuthorClick}
            aria-label={`Профиль: ${displayLabel}`}
            style={{
              ...buttonReset,
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--blue-accent)',
              marginBottom: 2,
              maxWidth: '100%',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: 'block',
            }}
          >
            {displayLabel}
          </button>
        )}
        {message.replyToId && replyTo && (
          <ReplyPreview senderName={replyTo.senderName} content={replyTo.content} />
        )}
        <div>{text}</div>
        <ReactionBar
          reactions={message.reactions}
          onToggle={(emoji) => onReact(message.id, emoji)}
        />
      </div>
    </div>
  );

  const timestamp = (
    <span style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, padding: '0 4px' }}>
      {formatTime(message.createdAt)}
    </span>
  );

  if (!showAvatarAndName) {
    return (
      <div
        data-testid="chat-bubble"
        data-message-id={message.id}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: align,
          marginBottom: 8,
        }}
      >
        {body}
        {timestamp}
      </div>
    );
  }

  const avatarInner = (
    <UserAvatar
      avatarUrl={message.senderAvatarUrl}
      name={message.senderDisplayName}
      size={32}
      fontSize={13}
    />
  );
  const avatar = (
    <button
      type="button"
      disabled={!canOpenProfile}
      onClick={onAuthorClick}
      aria-label={`Аватар: ${displayLabel}`}
      style={{ ...buttonReset, flexShrink: 0 }}
    >
      {avatarInner}
    </button>
  );

  return (
    <div
      data-testid="chat-bubble"
      data-message-id={message.id}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: align,
        gap: 8,
        marginBottom: 8,
        maxWidth: '85%',
        alignSelf: align,
      }}
    >
      {avatar}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: align, minWidth: 0 }}>
        {body}
        {timestamp}
      </div>
    </div>
  );
}

function areEqual(prev: ChatBubbleProps, next: ChatBubbleProps): boolean {
  return (
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.isDeleted === next.message.isDeleted &&
    prev.message.reactions === next.message.reactions &&
    prev.message.senderDisplayName === next.message.senderDisplayName &&
    prev.message.senderAvatarUrl === next.message.senderAvatarUrl &&
    prev.isOwn === next.isOwn &&
    prev.showAuthor === next.showAuthor &&
    prev.replyTo?.content === next.replyTo?.content &&
    prev.replyTo?.senderName === next.replyTo?.senderName &&
    prev.onRequestActions === next.onRequestActions &&
    prev.onReact === next.onReact &&
    prev.onOpenProfile === next.onOpenProfile
  );
}

export const ChatBubble = memo(ChatBubbleImpl, areEqual);
