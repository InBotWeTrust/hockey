import { memo } from 'react';
import type { ChatMessageDTO } from '../api.js';
import { ReplyPreview } from './ReplyPreview.js';
import { ReactionBar } from './ReactionBar.js';
import { useLongPress } from '../useLongPress.js';

interface ChatBubbleProps {
  message: ChatMessageDTO;
  isOwn: boolean;
  replyTo?: { senderName: string; content: string } | null;
  onRequestActions: (message: ChatMessageDTO, anchorRect: DOMRect) => void;
  onReact: (emoji: string) => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function ChatBubbleImpl({
  message,
  isOwn,
  replyTo,
  onRequestActions,
  onReact,
}: ChatBubbleProps): JSX.Element {
  const className = isOwn ? 'glass-dark' : 'glass';
  const align = isOwn ? 'flex-end' : 'flex-start';
  const radius = isOwn ? '20px 20px 4px 20px' : '20px 20px 20px 4px';
  const text = message.isDeleted ? 'Сообщение удалено' : message.content;

  const longPress = useLongPress(
    (rect) => {
      if (message.isDeleted) return;
      onRequestActions(message, rect);
    },
    { delayMs: 500 },
  );

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
      <div
        {...longPress}
        style={{
          maxWidth: '78%',
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
          {message.replyToId && replyTo && (
            <ReplyPreview senderName={replyTo.senderName} content={replyTo.content} />
          )}
          <div>{text}</div>
          <ReactionBar reactions={message.reactions} onToggle={onReact} />
        </div>
      </div>
      <span
        style={{
          fontSize: 10,
          color: 'var(--muted)',
          marginTop: 2,
          padding: '0 4px',
        }}
      >
        {formatTime(message.createdAt)}
      </span>
    </div>
  );
}

function areEqual(prev: ChatBubbleProps, next: ChatBubbleProps): boolean {
  return (
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.isDeleted === next.message.isDeleted &&
    prev.message.reactions === next.message.reactions &&
    prev.isOwn === next.isOwn &&
    prev.replyTo?.content === next.replyTo?.content &&
    prev.replyTo?.senderName === next.replyTo?.senderName &&
    prev.onRequestActions === next.onRequestActions &&
    prev.onReact === next.onReact
  );
}

export const ChatBubble = memo(ChatBubbleImpl, areEqual);
