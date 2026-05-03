import { Eye, MessageCircle, SmilePlus } from 'lucide-react';
import type { ChatMessageDTO } from '../api.js';
import { ReactionBar } from './ReactionBar.js';

interface ChannelPostCardProps {
  post: ChatMessageDTO;
  showViews: boolean;
  onReact: (postId: string, emoji: string) => void;
  onOpenReactionPicker: (postId: string, anchorRect: DOMRect) => void;
  onOpenComments: (postId: string) => void;
}

function formatPostTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ChannelPostCard({
  post,
  showViews,
  onReact,
  onOpenReactionPicker,
  onOpenComments,
}: ChannelPostCardProps): JSX.Element {
  return (
    <article
      data-message-id={post.id}
      className="glass"
      style={{
        borderRadius: 18,
        padding: 14,
        marginBottom: 10,
        color: 'var(--ink)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 8,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: 'var(--blue-accent)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {post.senderDisplayName ?? 'Админ'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
            {formatPostTime(post.createdAt)}
          </div>
        </div>
        {showViews && (
          <div
            className="pill"
            aria-label={`Просмотры: ${post.viewCount ?? 0}`}
            style={{ padding: '4px 8px', fontSize: 11, flexShrink: 0 }}
          >
            <Eye size={12} />
            <span>{post.viewCount ?? 0}</span>
          </div>
        )}
      </div>

      <div
        style={{
          fontSize: 15,
          lineHeight: 1.45,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {post.content}
      </div>

      <ReactionBar reactions={post.reactions} onToggle={(emoji) => onReact(post.id, emoji)} />

      <div
        style={{
          display: 'flex',
          gap: 8,
          marginTop: 10,
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          className="pill"
          aria-label="Добавить реакцию"
          onClick={(event) =>
            onOpenReactionPicker(post.id, event.currentTarget.getBoundingClientRect())
          }
          style={{ padding: '7px 10px', cursor: 'pointer' }}
        >
          <SmilePlus size={14} />
        </button>
        <button
          type="button"
          className="pill"
          onClick={() => onOpenComments(post.id)}
          style={{ padding: '7px 10px', cursor: 'pointer' }}
        >
          <MessageCircle size={14} />
          <span>Комментарии {post.commentCount ?? 0}</span>
        </button>
      </div>
    </article>
  );
}
