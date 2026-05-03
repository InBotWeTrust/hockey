import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, SmilePlus } from 'lucide-react';
import {
  addChannelCommentReaction,
  fetchChannelPost,
  fetchChannelPostComments,
  removeChannelCommentReaction,
  sendChannelPostComment,
  type ChannelPostCommentDTO,
} from '../api.js';
import { ChatInput } from '../components/ChatInput.js';
import { ReactionBar } from '../components/ReactionBar.js';
import { ReactionPicker } from '../components/ReactionPicker.js';
import { ReplyPreview } from '../components/ReplyPreview.js';
import { UserAvatar } from '../components/UserAvatar.js';
import { chatKeys } from '../../lib/queryKeys.js';
import { useChatStore } from '../chatStore.js';
import { RichText } from '../richText.js';
import { removeMyReactionFromReactable, switchMyReactionToReactable } from '../reactionsState.js';

function formatCommentTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function CommentRow({
  comment,
  replyTo,
  onReply,
  onOpenReactionPicker,
  onToggleReaction,
}: {
  comment: ChannelPostCommentDTO;
  replyTo: ChannelPostCommentDTO | null;
  onReply: (comment: ChannelPostCommentDTO) => void;
  onOpenReactionPicker: (commentId: string, anchorRect: DOMRect) => void;
  onToggleReaction: (commentId: string, emoji: string) => void;
}): JSX.Element {
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
          {replyTo && (
            <ReplyPreview
              senderName={replyTo.authorDisplayName ?? 'Участник'}
              content={replyTo.content}
            />
          )}
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
        <ReactionBar
          reactions={comment.reactions}
          onToggle={(emoji) => onToggleReaction(comment.id, emoji)}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 10,
            color: 'var(--muted)',
            marginTop: 2,
            paddingLeft: 4,
          }}
        >
          <span>{formatCommentTime(comment.createdAt)}</span>
          <button
            type="button"
            onClick={() => onReply(comment)}
            style={{
              border: 'none',
              background: 'transparent',
              padding: 0,
              color: 'var(--muted)',
              font: 'inherit',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Ответить
          </button>
          <button
            type="button"
            aria-label="Добавить реакцию"
            onClick={(event) =>
              onOpenReactionPicker(comment.id, event.currentTarget.getBoundingClientRect())
            }
            style={{
              border: 'none',
              background: 'transparent',
              padding: 0,
              color: 'var(--muted)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            <SmilePlus size={14} />
          </button>
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
  const [replyToComment, setReplyToComment] = useState<ChannelPostCommentDTO | null>(null);
  const [pickerTarget, setPickerTarget] = useState<{
    commentId: string;
    anchorRect: DOMRect;
  } | null>(null);

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
    mutationFn: (vars: { content: string; replyToId: string | null }) =>
      sendChannelPostComment(postId, vars.content, vars.replyToId),
    onSuccess: (comment) => {
      queryClient.setQueryData<ChannelPostCommentDTO[] | undefined>(
        chatKeys.channelComments(postId),
        (old) => [...(old ?? []), comment],
      );
      void queryClient.invalidateQueries({ queryKey: chatKeys.channelPost(postId) });
      void queryClient.invalidateQueries({ queryKey: chatKeys.messages(chatId) });
    },
  });

  const addReactionMut = useMutation<
    Awaited<ReturnType<typeof addChannelCommentReaction>>,
    Error,
    { commentId: string; emoji: string },
    { prev: ChannelPostCommentDTO[] | undefined }
  >({
    mutationFn: ({ commentId, emoji }) => addChannelCommentReaction(commentId, emoji),
    onMutate: ({ commentId, emoji }) => {
      const prev = queryClient.getQueryData<ChannelPostCommentDTO[]>(
        chatKeys.channelComments(postId),
      );
      queryClient.setQueryData<ChannelPostCommentDTO[] | undefined>(
        chatKeys.channelComments(postId),
        (old) =>
          old?.map((comment) =>
            comment.id === commentId ? switchMyReactionToReactable(comment, emoji) : comment,
          ) ?? old,
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(chatKeys.channelComments(postId), ctx.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.channelComments(postId) });
    },
  });

  const removeReactionMut = useMutation<
    void,
    Error,
    { commentId: string; emoji: string },
    { prev: ChannelPostCommentDTO[] | undefined }
  >({
    mutationFn: ({ commentId, emoji }) => removeChannelCommentReaction(commentId, emoji),
    onMutate: ({ commentId, emoji }) => {
      const prev = queryClient.getQueryData<ChannelPostCommentDTO[]>(
        chatKeys.channelComments(postId),
      );
      queryClient.setQueryData<ChannelPostCommentDTO[] | undefined>(
        chatKeys.channelComments(postId),
        (old) =>
          old?.map((comment) =>
            comment.id === commentId ? removeMyReactionFromReactable(comment, emoji) : comment,
          ) ?? old,
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(chatKeys.channelComments(postId), ctx.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.channelComments(postId) });
    },
  });

  const handleSend = useCallback(
    (content: string, replyToId: string | null): void => {
      sendMut.mutate({ content, replyToId });
    },
    [sendMut],
  );

  const comments = commentsQuery.data ?? [];
  const commentById = new Map(comments.map((comment) => [comment.id, comment]));

  const addReaction = addReactionMut.mutate;
  const removeReaction = removeReactionMut.mutate;
  const handleToggleReaction = useCallback(
    (commentId: string, emoji: string): void => {
      const comment = queryClient
        .getQueryData<ChannelPostCommentDTO[]>(chatKeys.channelComments(postId))
        ?.find((item) => item.id === commentId);
      const existing = comment?.reactions.find((reaction) => reaction.emoji === emoji);
      if (existing?.reactedByMe) {
        removeReaction({ commentId, emoji });
      } else {
        addReaction({ commentId, emoji });
      }
    },
    [addReaction, postId, queryClient, removeReaction],
  );

  const handleOpenReactionPicker = useCallback((commentId: string, anchorRect: DOMRect): void => {
    setPickerTarget({ commentId, anchorRect });
  }, []);

  const handlePickEmoji = useCallback(
    (emoji: string): void => {
      if (!pickerTarget) return;
      addReaction({ commentId: pickerTarget.commentId, emoji });
    },
    [addReaction, pickerTarget],
  );

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
          <CommentRow
            key={comment.id}
            comment={comment}
            replyTo={comment.replyToId ? (commentById.get(comment.replyToId) ?? null) : null}
            onReply={setReplyToComment}
            onOpenReactionPicker={handleOpenReactionPicker}
            onToggleReaction={handleToggleReaction}
          />
        ))}
      </div>

      <div style={{ marginBottom: 'max(12px, var(--app-safe-bottom))' }}>
        <ChatInput
          replyTo={replyToComment}
          replyToSenderName={replyToComment?.authorDisplayName ?? undefined}
          placeholder="Комментарий..."
          onClearReply={() => setReplyToComment(null)}
          disabled={sendMut.isPending}
          onSend={handleSend}
        />
      </div>

      <ReactionPicker
        open={pickerTarget !== null}
        anchorRect={pickerTarget?.anchorRect ?? null}
        onPick={handlePickEmoji}
        onClose={() => setPickerTarget(null)}
      />
    </main>
  );
}
