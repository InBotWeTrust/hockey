import { MessageCircle, Pencil, SmilePlus } from 'lucide-react';
import type { ChatMessageDTO } from '../api.js';
import { ReactionBar } from './ReactionBar.js';
import { RichText } from '../richText.js';

interface ChannelPostCardProps {
  post: ChatMessageDTO;
  showViews: boolean;
  canEdit?: boolean;
  onReact: (postId: string, emoji: string) => void;
  onOpenReactionPicker: (postId: string, anchorRect: DOMRect) => void;
  onOpenComments: (postId: string) => void;
  onEdit?: (post: ChatMessageDTO) => void;
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
  canEdit = false,
  onReact,
  onOpenReactionPicker,
  onOpenComments,
  onEdit,
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
          fontSize: 15,
          lineHeight: 1.45,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        <RichText text={post.content} />
      </div>

      <ReactionBar reactions={post.reactions} onToggle={(emoji) => onReact(post.id, emoji)} />

      <div
        style={{
          display: 'flex',
          gap: 8,
          marginTop: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
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
        {canEdit && (
          <button
            type="button"
            className="pill"
            aria-label="Редактировать пост"
            onClick={() => onEdit?.(post)}
            style={{ padding: '7px 10px', cursor: 'pointer' }}
          >
            <Pencil size={14} />
          </button>
        )}
        <button
          type="button"
          className="pill"
          onClick={() => onOpenComments(post.id)}
          style={{ padding: '7px 10px', cursor: 'pointer' }}
        >
          <MessageCircle size={14} />
          <span>Комментарии – {post.commentCount ?? 0}</span>
        </button>
        <time
          dateTime={post.createdAt}
          style={{
            marginLeft: 'auto',
            paddingLeft: 8,
            alignSelf: 'center',
            color: 'var(--muted)',
            fontSize: 11,
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
          }}
        >
          {showViews ? `(${post.viewCount ?? 0}) ` : ''}
          {formatPostTime(post.createdAt)}
        </time>
      </div>
    </article>
  );
}
