import { memo } from 'react';
import type { ChatMessageDTO } from '../api.js';
import { ReplyPreview } from './ReplyPreview.js';
import { MessageActions } from './MessageActions.js';

interface ChatBubbleProps {
  message: ChatMessageDTO;
  isOwn: boolean;
  // Context needed to render an in-bubble quote when replyToId is set.
  // Looked up by parent (ChatRoomScreen) from the local messages cache.
  replyTo?: { senderName: string; content: string } | null;
  onReply: (message: ChatMessageDTO) => void;
  onDelete: (messageId: string) => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function ChatBubbleImpl({
  message,
  isOwn,
  replyTo,
  onReply,
  onDelete,
}: ChatBubbleProps): JSX.Element {
  const className = isOwn ? 'glass-dark' : 'glass';
  const align = isOwn ? 'flex-end' : 'flex-start';
  const radius = isOwn ? '20px 20px 4px 20px' : '20px 20px 20px 4px';
  const text = message.isDeleted ? 'Сообщение удалено' : message.content;

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
      <div style={{ maxWidth: '78%', display: 'flex', alignItems: 'center', gap: 6 }}>
        {!isOwn && (
          <MessageActions
            isOwn={false}
            onReply={() => onReply(message)}
            disabled={message.isDeleted}
          />
        )}
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
        </div>
        {isOwn && (
          <MessageActions
            isOwn
            onReply={() => onReply(message)}
            onDelete={() => onDelete(message.id)}
            disabled={message.isDeleted}
          />
        )}
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

// Spec §10.11 — explicit comparator so typing in ChatInput doesn't re-render
// every bubble. We depend only on identity-stable fields plus content/isDeleted.
function areEqual(prev: ChatBubbleProps, next: ChatBubbleProps): boolean {
  return (
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.isDeleted === next.message.isDeleted &&
    prev.isOwn === next.isOwn &&
    prev.replyTo?.content === next.replyTo?.content &&
    prev.replyTo?.senderName === next.replyTo?.senderName &&
    prev.onReply === next.onReply &&
    prev.onDelete === next.onDelete
  );
}

export const ChatBubble = memo(ChatBubbleImpl, areEqual);
