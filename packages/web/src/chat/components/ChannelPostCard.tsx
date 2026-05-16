import { FileText, MessageCircle, Pencil, SmilePlus } from 'lucide-react';
import type { ChatMessageDTO } from '../api.js';
import { ReactionBar } from './ReactionBar.js';
import { RichText } from '../richText.js';
import { ChannelPoll } from './ChannelPoll.js';
import { messageAttachments } from '../messagePreview.js';

interface ChannelPostCardProps {
  post: ChatMessageDTO;
  showViews: boolean;
  canEdit?: boolean;
  onReact: (postId: string, emoji: string) => void;
  onOpenReactionPicker: (postId: string, anchorRect: DOMRect) => void;
  onOpenComments: (postId: string) => void;
  onPollVote: (postId: string, optionId: string) => void;
  onPollClearVote: (postId: string) => void;
  onEdit?: (post: ChatMessageDTO) => void;
  pollDisabled?: boolean;
}

function formatPostTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAttachmentSize(size: number | undefined): string | null {
  if (size === undefined) return null;
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
  if (size >= 1024) return `${Math.round(size / 1024)} КБ`;
  return `${size} Б`;
}

export function ChannelPostCard({
  post,
  showViews,
  canEdit = false,
  onReact,
  onOpenReactionPicker,
  onOpenComments,
  onPollVote,
  onPollClearVote,
  onEdit,
  pollDisabled = false,
}: ChannelPostCardProps): JSX.Element {
  const attachments = messageAttachments(post.metadata);
  const hasText = post.content.trim().length > 0;

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
      {attachments.length > 0 && (
        <div style={{ display: 'grid', gap: 8, marginBottom: hasText ? 12 : 0 }}>
          {attachments.map((attachment) => {
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
                    alt=""
                    style={{
                      display: 'block',
                      width: '100%',
                      maxHeight: 320,
                      objectFit: 'cover',
                      borderRadius: 16,
                      border: '1px solid rgba(255,255,255,0.62)',
                    }}
                  />
                </a>
              );
            }
            if (attachment.kind === 'voice') {
              return (
                <audio
                  key={attachment.id}
                  controls
                  preload="metadata"
                  src={attachment.url}
                  aria-label="Голосовое сообщение"
                  style={{ display: 'block', width: 260, maxWidth: '100%' }}
                />
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
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 16,
                  background: 'rgba(255,255,255,0.65)',
                  color: 'inherit',
                  textDecoration: 'none',
                }}
              >
                <FileText size={18} />
                <span style={{ minWidth: 0 }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 13,
                      fontWeight: 900,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {attachment.originalName ?? 'Файл'}
                  </span>
                  {size && (
                    <span style={{ display: 'block', fontSize: 11, opacity: 0.7 }}>{size}</span>
                  )}
                </span>
              </a>
            );
          })}
        </div>
      )}

      {hasText && (
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
      )}

      {post.poll && (
        <ChannelPoll
          postId={post.id}
          poll={post.poll}
          disabled={pollDisabled}
          onVote={onPollVote}
          onClearVote={onPollClearVote}
        />
      )}

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
