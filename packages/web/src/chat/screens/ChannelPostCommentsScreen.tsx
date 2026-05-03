import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  addChannelCommentReaction,
  deleteChannelPostComment,
  fetchChannelPost,
  fetchChannelPostComments,
  removeChannelCommentReaction,
  sendChannelPostComment,
  type ChannelPostCommentDTO,
} from '../api.js';
import { ChatInput } from '../components/ChatInput.js';
import { MessageActionsMenu } from '../components/MessageActionsMenu.js';
import { ReactionBar } from '../components/ReactionBar.js';
import { ReactionPicker } from '../components/ReactionPicker.js';
import { ReplyPreview } from '../components/ReplyPreview.js';
import { UserAvatar } from '../components/UserAvatar.js';
import { chatKeys } from '../../lib/queryKeys.js';
import { useAuthStore } from '../../auth/authStore.js';
import { useChatStore } from '../chatStore.js';
import { RichText } from '../richText.js';
import { removeMyReactionFromReactable, switchMyReactionToReactable } from '../reactionsState.js';
import { useLongPress } from '../useLongPress.js';

function formatCommentTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function CommentRow({
  comment,
  replyTo,
  onRequestActions,
  onToggleReaction,
}: {
  comment: ChannelPostCommentDTO;
  replyTo: ChannelPostCommentDTO | null;
  onRequestActions: (comment: ChannelPostCommentDTO, anchorRect: DOMRect) => void;
  onToggleReaction: (commentId: string, emoji: string) => void;
}): JSX.Element {
  const longPress = useLongPress(
    (rect) => {
      onRequestActions(comment, rect);
    },
    { delayMs: 500 },
  );

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
          {...longPress}
          className="glass"
          onDoubleClick={(event) =>
            onRequestActions(comment, event.currentTarget.getBoundingClientRect())
          }
          style={{
            borderRadius: '16px 16px 16px 4px',
            padding: '8px 11px',
            color: 'var(--ink)',
            touchAction: 'manipulation',
            userSelect: 'none',
            WebkitUserSelect: 'none',
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
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 8,
              marginTop: 4,
            }}
          >
            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
              <ReactionBar
                reactions={comment.reactions}
                onToggle={(emoji) => onToggleReaction(comment.id, emoji)}
                style={{ marginTop: 0 }}
              />
            </div>
            <div
              style={{
                flexShrink: 0,
                marginLeft: 'auto',
                fontSize: 10,
                color: 'var(--muted)',
                lineHeight: 1.15,
                textAlign: 'right',
              }}
            >
              {formatCommentTime(comment.createdAt)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ActionTarget {
  comment: ChannelPostCommentDTO;
  anchorRect: DOMRect;
}

export function ChannelPostCommentsScreen(): JSX.Element {
  const params = useParams<{ chatId: string; postId: string }>();
  const chatId = params.chatId ?? '';
  const postId = params.postId ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setActive = useChatStore((s) => s.setActive);
  const me = useAuthStore((s) => s.user);
  const meId = me?.id ?? null;
  const isAdmin = me?.role === 'admin';
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [replyToComment, setReplyToComment] = useState<ChannelPostCommentDTO | null>(null);
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
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

  const deleteCommentMut = useMutation<
    void,
    Error,
    string,
    { prev: ChannelPostCommentDTO[] | undefined }
  >({
    mutationFn: (commentId) => deleteChannelPostComment(commentId),
    onMutate: (commentId) => {
      const prev = queryClient.getQueryData<ChannelPostCommentDTO[]>(
        chatKeys.channelComments(postId),
      );
      queryClient.setQueryData<ChannelPostCommentDTO[] | undefined>(
        chatKeys.channelComments(postId),
        (old) => old?.filter((comment) => comment.id !== commentId) ?? old,
      );
      if (replyToComment?.id === commentId) setReplyToComment(null);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(chatKeys.channelComments(postId), ctx.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.channelComments(postId) });
      void queryClient.invalidateQueries({ queryKey: chatKeys.channelPost(postId) });
      void queryClient.invalidateQueries({ queryKey: chatKeys.messages(chatId) });
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

  const handleRequestActions = useCallback(
    (comment: ChannelPostCommentDTO, anchorRect: DOMRect): void => {
      setActionTarget({ comment, anchorRect });
    },
    [],
  );

  const handleCloseActions = useCallback(() => setActionTarget(null), []);

  const handlePickEmojiFromMenu = useCallback(
    (emoji: string): void => {
      if (!actionTarget) return;
      addReaction({ commentId: actionTarget.comment.id, emoji });
    },
    [actionTarget, addReaction],
  );

  const handleMoreEmoji = useCallback((): void => {
    if (!actionTarget) return;
    setPickerTarget({ commentId: actionTarget.comment.id, anchorRect: actionTarget.anchorRect });
    setActionTarget(null);
  }, [actionTarget]);

  const handlePickEmoji = useCallback(
    (emoji: string): void => {
      if (!pickerTarget) return;
      addReaction({ commentId: pickerTarget.commentId, emoji });
    },
    [addReaction, pickerTarget],
  );

  const actionComment = actionTarget?.comment ?? null;
  const canDeleteAction =
    actionComment !== null && (isAdmin || (meId !== null && actionComment.authorId === meId));

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
            onRequestActions={handleRequestActions}
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
      <MessageActionsMenu
        open={actionTarget !== null}
        anchorRect={actionTarget?.anchorRect ?? null}
        isOwn={canDeleteAction}
        onReply={() => actionComment && setReplyToComment(actionComment)}
        onDelete={() => actionComment && deleteCommentMut.mutate(actionComment.id)}
        onPickEmoji={handlePickEmojiFromMenu}
        onMoreEmoji={handleMoreEmoji}
        onClose={handleCloseActions}
      />
    </main>
  );
}
