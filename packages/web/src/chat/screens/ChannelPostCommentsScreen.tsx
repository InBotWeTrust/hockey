import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  fetchChannelPost,
  fetchChannelPostComments,
  sendChannelPostComment,
  type ChannelPostCommentDTO,
} from '../api.js';
import { ChatInput } from '../components/ChatInput.js';
import { UserAvatar } from '../components/UserAvatar.js';
import { chatKeys } from '../../lib/queryKeys.js';
import { useChatStore } from '../chatStore.js';
import { RichText } from '../richText.js';

function formatCommentTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function CommentRow({ comment }: { comment: ChannelPostCommentDTO }): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
      <UserAvatar
        avatarUrl={comment.authorAvatarUrl}
        name={comment.authorDisplayName}
        size={30}
        fontSize={12}
      />
      <div style={{ minWidth: 0, maxWidth: '82%' }}>
        <div
          className="glass"
          style={{
            borderRadius: '16px 16px 16px 4px',
            padding: '8px 11px',
            color: 'var(--ink)',
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: 'var(--blue-accent)',
              marginBottom: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {comment.authorDisplayName ?? 'Участник'}
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.4, wordBreak: 'break-word' }}>
            {comment.content}
          </div>
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, paddingLeft: 4 }}>
          {formatCommentTime(comment.createdAt)}
        </div>
      </div>
    </div>
  );
}

export function ChannelPostCommentsScreen(): JSX.Element {
  const params = useParams<{ chatId: string; postId: string }>();
  const chatId = params.chatId ?? '';
  const postId = params.postId ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setActive = useChatStore((s) => s.setActive);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!chatId) return;
    setActive(chatId);
    return () => setActive(null);
  }, [chatId, setActive]);

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const update = (): void => setViewportHeight(vv.height);
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  const postQuery = useQuery({
    queryKey: chatKeys.channelPost(postId),
    queryFn: () => fetchChannelPost(postId),
    enabled: postId.length > 0,
  });

  const commentsQuery = useQuery({
    queryKey: chatKeys.channelComments(postId),
    queryFn: () => fetchChannelPostComments(postId),
    enabled: postId.length > 0,
  });

  const sendMut = useMutation({
    mutationFn: (content: string) => sendChannelPostComment(postId, content),
    onSuccess: (comment) => {
      queryClient.setQueryData<ChannelPostCommentDTO[] | undefined>(
        chatKeys.channelComments(postId),
        (old) => [...(old ?? []), comment],
      );
      void queryClient.invalidateQueries({ queryKey: chatKeys.channelPost(postId) });
      void queryClient.invalidateQueries({ queryKey: chatKeys.messages(chatId) });
    },
  });

  const handleSend = useCallback(
    (content: string): void => {
      sendMut.mutate(content);
    },
    [sendMut],
  );

  const comments = commentsQuery.data ?? [];

  return (
    <main
      className="screen"
      style={{
        height: viewportHeight !== null ? `${viewportHeight}px` : '100dvh',
        paddingTop: 'var(--app-safe-top)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          margin: '10px 12px 8px',
        }}
      >
        <button
          type="button"
          className="icon-btn glass"
          aria-label="К посту"
          onClick={() => navigate(`/chat/${chatId}`)}
          style={{ width: 40, height: 40, minWidth: 40, minHeight: 40 }}
        >
          <ArrowLeft size={16} />
        </button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Комментарии</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{comments.length}</div>
        </div>
      </div>

      <div
        className="no-scrollbar"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: '4px 14px 12px',
        }}
      >
        {postQuery.data && (
          <div
            className="glass-dark"
            style={{
              borderRadius: 18,
              padding: 12,
              fontSize: 14,
              lineHeight: 1.42,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            <RichText text={postQuery.data.content} />
          </div>
        )}
        {commentsQuery.isLoading && (
          <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: 18 }}>
            Загрузка...
          </div>
        )}
        {commentsQuery.isError && (
          <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: 18 }}>
            Не удалось загрузить комментарии
          </div>
        )}
        {comments.map((comment) => (
          <CommentRow key={comment.id} comment={comment} />
        ))}
      </div>

      <div style={{ marginBottom: 'max(12px, var(--app-safe-bottom))' }}>
        <ChatInput
          replyTo={null}
          placeholder="Комментарий..."
          onClearReply={() => undefined}
          disabled={sendMut.isPending}
          onSend={(content) => handleSend(content)}
        />
      </div>
    </main>
  );
}
