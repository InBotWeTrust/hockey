import { memo, type ReactNode } from 'react';
import { Check, CheckCheck, FileText } from 'lucide-react';
import type { ChatMessageDTO } from '../api.js';
import { ReplyPreview } from './ReplyPreview.js';
import { ReactionBar } from './ReactionBar.js';
import { useLongPress } from '../useLongPress.js';
import { UserAvatar } from './UserAvatar.js';
import { messageAttachments, messageBodyPreview } from '../messagePreview.js';

interface ChatBubbleProps {
  message: ChatMessageDTO;
  isOwn: boolean;
  // When true, foreign bubbles render an avatar + author name above the body.
  // DM chats keep the cleaner layout where the counterpart is shown in the
  // room header, not on every bubble.
  showAuthor?: boolean;
  deliveryStatus?: 'delivered' | 'read' | undefined;
  replyTo?: { senderName: string; content: string } | null;
  onRequestActions: (message: ChatMessageDTO, anchorRect: DOMRect) => void;
  // Receives messageId so the parent can pass a stable useCallback reference
  // (without a per-bubble closure) — preserves React.memo across parent renders.
  onReact: (messageId: string, emoji: string) => void;
  actionSlot?: ReactNode;
  // Foreign group/system bubbles call this when the user taps the avatar or
  // author name — parent opens a profile preview sheet. Optional: if undefined,
  // the avatar and name render as non-interactive plain elements.
  onOpenProfile?: (sender: {
    userId: string;
    displayName: string;
    avatarUrl: string | null;
  }) => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatAttachmentSize(size: number | undefined): string | null {
  if (size === undefined) return null;
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
  if (size >= 1024) return `${Math.round(size / 1024)} КБ`;
  return `${size} Б`;
}

function ChatBubbleImpl({
  message,
  isOwn,
  showAuthor = false,
  deliveryStatus,
  replyTo,
  onRequestActions,
  onReact,
  actionSlot,
  onOpenProfile,
}: ChatBubbleProps): JSX.Element {
  const className = isOwn ? 'glass-dark' : 'glass';
  const align = isOwn ? 'flex-end' : 'flex-start';
  const radius = isOwn ? '20px 20px 4px 20px' : '20px 20px 20px 4px';
  const attachments = message.isDeleted ? [] : messageAttachments(message.metadata);
  const text = message.isDeleted
    ? 'Сообщение удалено'
    : message.content.trim().length > 0
      ? message.content.trim()
      : attachments.length > 0
        ? ''
        : messageBodyPreview(message);
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

  const deliveryIndicator =
    deliveryStatus !== undefined ? (
      <span
        aria-label={deliveryStatus === 'read' ? 'Прочитано' : 'Доставлено'}
        title={deliveryStatus === 'read' ? 'Прочитано' : 'Доставлено'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          color: deliveryStatus === 'read' ? 'rgba(186, 225, 255, 0.95)' : 'currentColor',
        }}
      >
        {deliveryStatus === 'read' ? <CheckCheck size={14} /> : <Check size={13} />}
      </span>
    ) : null;
  const timestampReserveWidth = deliveryStatus !== undefined ? 54 : 36;
  const showEdited = message.isEdited === true && !message.isDeleted;

  const timestamp = (
    <time
      dateTime={message.createdAt}
      style={{
        position: 'absolute',
        right: 0,
        bottom: 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 10,
        lineHeight: '18px',
        fontWeight: 600,
        color: isOwn ? 'rgba(255, 255, 255, 0.72)' : 'rgba(71, 85, 105, 0.74)',
        whiteSpace: 'nowrap',
      }}
    >
      <span>{formatTime(message.createdAt)}</span>
      {deliveryIndicator}
    </time>
  );

  // Bubble body + author label. Wrapped in a row layout (with
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
        {attachments.length > 0 && (
          <div style={{ display: 'grid', gap: 6, marginBottom: text.length > 0 ? 6 : 0 }}>
            {attachments.map((attachment) => {
              if (attachment.kind === 'voice') {
                return (
                  <audio
                    key={attachment.id}
                    controls
                    preload="metadata"
                    src={attachment.url}
                    aria-label="Голосовое сообщение"
                    style={{
                      display: 'block',
                      width: 230,
                      maxWidth: '100%',
                      colorScheme: isOwn ? 'dark' : 'light',
                    }}
                  />
                );
              }
              if (attachment.kind === 'image') {
                const imageName = attachment.originalName ?? 'Изображение';
                return (
                  <a
                    key={attachment.id}
                    href={attachment.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Открыть изображение: ${imageName}`}
                    style={{ display: 'block', color: 'inherit' }}
                  >
                    <img
                      src={attachment.url}
                      alt={`Миниатюра: ${imageName}`}
                      style={{
                        display: 'block',
                        width: '100%',
                        maxWidth: 240,
                        maxHeight: 260,
                        objectFit: 'cover',
                        borderRadius: 14,
                      }}
                    />
                  </a>
                );
              }
              const size = formatAttachmentSize(attachment.size);
              return (
                <a
                  key={attachment.id}
                  href={attachment.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 10px',
                    borderRadius: 14,
                    background: isOwn ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.65)',
                    color: 'inherit',
                    textDecoration: 'none',
                  }}
                >
                  <FileText size={16} />
                  <span style={{ minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 12,
                        fontWeight: 800,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {attachment.originalName ?? 'Файл'}
                    </span>
                    {size && (
                      <span style={{ display: 'block', fontSize: 10, opacity: 0.72 }}>{size}</span>
                    )}
                  </span>
                </a>
              );
            })}
          </div>
        )}
        <div style={{ position: 'relative' }}>
          {text.length > 0 && <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>}
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: timestampReserveWidth,
              height: 14,
              verticalAlign: 'baseline',
            }}
          />
          {timestamp}
        </div>
        {showEdited && (
          <div
            style={{
              marginTop: 2,
              fontSize: 10,
              lineHeight: 1.2,
              fontWeight: 700,
              color: isOwn ? 'rgba(255, 255, 255, 0.62)' : 'rgba(71, 85, 105, 0.62)',
            }}
          >
            изменено
          </div>
        )}
        <ReactionBar
          reactions={message.reactions}
          onToggle={(emoji) => onReact(message.id, emoji)}
        />
        {actionSlot && <div style={{ marginTop: 8 }}>{actionSlot}</div>}
      </div>
    </div>
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
      </div>
    </div>
  );
}

function areEqual(prev: ChatBubbleProps, next: ChatBubbleProps): boolean {
  return (
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.metadata === next.message.metadata &&
    prev.message.isDeleted === next.message.isDeleted &&
    prev.message.isEdited === next.message.isEdited &&
    prev.message.reactions === next.message.reactions &&
    prev.message.senderDisplayName === next.message.senderDisplayName &&
    prev.message.senderAvatarUrl === next.message.senderAvatarUrl &&
    prev.isOwn === next.isOwn &&
    prev.showAuthor === next.showAuthor &&
    prev.deliveryStatus === next.deliveryStatus &&
    prev.replyTo?.content === next.replyTo?.content &&
    prev.replyTo?.senderName === next.replyTo?.senderName &&
    prev.actionSlot === next.actionSlot &&
    prev.onRequestActions === next.onRequestActions &&
    prev.onReact === next.onReact &&
    prev.onOpenProfile === next.onOpenProfile
  );
}

export const ChatBubble = memo(ChatBubbleImpl, areEqual);
