import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, X } from 'lucide-react';
import {
  addChannelCommentReaction,
  deleteChannelPostComment,
  fetchChannelPost,
  fetchChannelPostComments,
  removeChannelCommentReaction,
  sendChannelPostComment,
  uploadChatAttachment,
  type ChatAttachmentDTO,
  type ChannelPostCommentDTO,
  type UserPickerItem,
} from '../api.js';
import { ChatInput } from '../components/ChatInput.js';
import { MessageActionsMenu } from '../components/MessageActionsMenu.js';
import { ReactionBar } from '../components/ReactionBar.js';
import { ReactionPicker } from '../components/ReactionPicker.js';
import { ReplyPreview } from '../components/ReplyPreview.js';
import { UserAvatar } from '../components/UserAvatar.js';
import { UserProfileSheet } from '../components/UserProfileSheet.js';
import { chatKeys } from '../../lib/queryKeys.js';
import { useAuthStore } from '../../auth/authStore.js';
import { useChatStore } from '../chatStore.js';
import { RichText } from '../richText.js';
import { removeMyReactionFromReactable, switchMyReactionToReactable } from '../reactionsState.js';
import { useLongPress } from '../useLongPress.js';
import { messageAttachments } from '../messagePreview.js';

function formatCommentTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

interface PendingCommentAttachment {
  token: number;
  fileName: string;
  previewUrl: string | null;
  previewKind: 'image' | 'file';
  media: ChatAttachmentDTO | null;
  isUploading: boolean;
}

function createAttachmentPreviewUrl(file: File): string | null {
  if (!file.type.startsWith('image/')) return null;
  if (typeof URL.createObjectURL !== 'function') return null;
  return URL.createObjectURL(file);
}

function formatAttachmentSize(size: number | undefined): string | null {
  if (size === undefined) return null;
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
  if (size >= 1024) return `${Math.round(size / 1024)} КБ`;
  return `${size} Б`;
}

function CommentRow({
  comment,
  replyTo,
  onRequestActions,
  onToggleReaction,
  onOpenProfile,
}: {
  comment: ChannelPostCommentDTO;
  replyTo: ChannelPostCommentDTO | null;
  onRequestActions: (comment: ChannelPostCommentDTO, anchorRect: DOMRect) => void;
  onToggleReaction: (commentId: string, emoji: string) => void;
  onOpenProfile: (sender: UserPickerItem) => void;
}): JSX.Element {
  const longPress = useLongPress(
    (rect) => {
      onRequestActions(comment, rect);
    },
    { delayMs: 500 },
  );
  const authorName = comment.authorDisplayName ?? 'Участник';
  const attachments = comment.isDeleted ? [] : messageAttachments(comment.metadata);

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
      <button
        type="button"
        aria-label={`Аватар: ${authorName}`}
        onClick={() =>
          onOpenProfile({
            userId: comment.authorId,
            displayName: authorName,
            avatarUrl: comment.authorAvatarUrl,
          })
        }
        style={{
          flexShrink: 0,
          padding: 0,
          border: 'none',
          background: 'transparent',
          color: 'inherit',
          cursor: 'pointer',
        }}
      >
        <UserAvatar
          avatarUrl={comment.authorAvatarUrl}
          name={comment.authorDisplayName}
          size={30}
          fontSize={12}
        />
      </button>
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
            {authorName}
          </div>
          {attachments.length > 0 && (
            <div style={{ display: 'grid', gap: 6, marginBottom: comment.content ? 7 : 0 }}>
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
                          maxWidth: 240,
                          maxHeight: 240,
                          objectFit: 'cover',
                          borderRadius: 14,
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
                      style={{ display: 'block', width: 220, maxWidth: '100%' }}
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
                      gap: 8,
                      padding: '8px 10px',
                      borderRadius: 14,
                      background: 'rgba(255,255,255,0.65)',
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
                        <span style={{ display: 'block', fontSize: 10, opacity: 0.72 }}>
                          {size}
                        </span>
                      )}
                    </span>
                  </a>
                );
              })}
            </div>
          )}
          {comment.content && (
            <div
              style={{
                fontSize: 14,
                lineHeight: 1.4,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {comment.content}
            </div>
          )}
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
  const [previewSender, setPreviewSender] = useState<UserPickerItem | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentUploadTokenRef = useRef(0);
  const [pendingAttachment, setPendingAttachment] = useState<PendingCommentAttachment | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const clearPendingAttachment = useCallback((): void => {
    attachmentUploadTokenRef.current += 1;
    setPendingAttachment((current) => {
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
    setAttachmentError(null);
  }, []);

  useEffect(() => {
    if (!chatId) return;
    setActive(chatId);
    return () => setActive(null);
  }, [chatId, setActive]);

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const desktopPointer =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
    if (desktopPointer) return;
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

  useEffect(() => clearPendingAttachment, [clearPendingAttachment]);

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
    mutationFn: (vars: {
      content: string;
      replyToId: string | null;
      attachmentIds?: string[];
    }) =>
      vars.attachmentIds && vars.attachmentIds.length > 0
        ? sendChannelPostComment(postId, vars.content, vars.replyToId, vars.attachmentIds)
        : sendChannelPostComment(postId, vars.content, vars.replyToId),
    onSuccess: (comment) => {
      clearPendingAttachment();
      queryClient.setQueryData<ChannelPostCommentDTO[] | undefined>(
        chatKeys.channelComments(postId),
        (old) => [...(old ?? []), comment],
      );
      void queryClient.invalidateQueries({ queryKey: chatKeys.channelPost(postId) });
      void queryClient.invalidateQueries({ queryKey: chatKeys.messages(chatId) });
    },
  });

  const uploadAttachmentMut = useMutation({
    mutationFn: ({ file }: { file: File; token: number }) => uploadChatAttachment(chatId, file),
    onSuccess: ({ media }, vars) => {
      if (vars.token !== attachmentUploadTokenRef.current) return;
      setPendingAttachment((current) =>
        current && current.token === vars.token
          ? { ...current, media, isUploading: false }
          : current,
      );
    },
    onError: (err, vars) => {
      if (vars.token !== attachmentUploadTokenRef.current) return;
      setPendingAttachment((current) => {
        if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
        return null;
      });
      setAttachmentError(err instanceof Error ? err.message : 'Не удалось прикрепить файл');
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
      const attachmentIds = pendingAttachment?.media ? [pendingAttachment.media.id] : [];
      sendMut.mutate({
        content,
        replyToId,
        ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
      });
    },
    [pendingAttachment, sendMut],
  );

  const comments = commentsQuery.data ?? [];
  const commentById = new Map(comments.map((comment) => [comment.id, comment]));
  const postAttachments = postQuery.data ? messageAttachments(postQuery.data.metadata) : [];

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
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        height: viewportHeight !== null ? `${viewportHeight}px` : '100dvh',
        overflow: 'hidden',
      }}
    >
      <div className="chat-edge-top chat-edge-top--overlay glass-edge-fade glass-edge-fade--top">
        <div
          className="chat-dock-header glass-dock-surface"
          style={{
            minHeight: 54,
          }}
        >
          <button
            type="button"
            className="icon-btn glass-dock-icon"
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
      </div>

      <div
        data-testid="comments-scroll"
        className="no-scrollbar"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: 'calc(88px + var(--app-safe-top)) 14px calc(96px + var(--app-safe-bottom))',
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
            {postAttachments.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gap: 8,
                  marginBottom: postQuery.data.content.trim() ? 12 : 0,
                }}
              >
                {postAttachments.map((attachment) => {
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
                        background: 'rgba(255,255,255,0.12)',
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
                          <span style={{ display: 'block', fontSize: 11, opacity: 0.7 }}>
                            {size}
                          </span>
                        )}
                      </span>
                    </a>
                  );
                })}
              </div>
            )}
            {postQuery.data.content.trim() && <RichText text={postQuery.data.content} />}
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
            onOpenProfile={setPreviewSender}
          />
        ))}
      </div>

      <div className="chat-edge-bottom chat-edge-bottom--overlay glass-edge-fade glass-edge-fade--bottom">
        <input
          ref={attachmentInputRef}
          type="file"
          accept="image/*,.pdf,.zip,.txt"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (!file) return;
            if (file.type.startsWith('audio/')) {
              setAttachmentError('В комментариях можно прикреплять только файлы');
              return;
            }
            const previewUrl = createAttachmentPreviewUrl(file);
            const token = attachmentUploadTokenRef.current + 1;
            attachmentUploadTokenRef.current = token;
            setAttachmentError(null);
            setPendingAttachment({
              token,
              fileName: file.name || 'Файл',
              previewUrl,
              previewKind: previewUrl ? 'image' : 'file',
              media: null,
              isUploading: true,
            });
            uploadAttachmentMut.mutate({ file, token });
          }}
        />
        <ChatInput
          replyTo={replyToComment}
          replyToSenderName={replyToComment?.authorDisplayName ?? undefined}
          placeholder="Комментарий..."
          attachmentPreview={
            pendingAttachment ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto minmax(0, 1fr) auto',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 16,
                  background: 'rgba(255,255,255,0.72)',
                  border: '1px solid rgba(255,255,255,0.74)',
                }}
              >
                {pendingAttachment.previewKind === 'image' && pendingAttachment.previewUrl ? (
                  <img
                    src={pendingAttachment.previewUrl}
                    alt=""
                    style={{
                      display: 'block',
                      width: 42,
                      height: 42,
                      borderRadius: 12,
                      objectFit: 'cover',
                    }}
                  />
                ) : (
                  <FileText size={16} color="var(--muted)" />
                )}
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      color: 'var(--ink)',
                      fontSize: 12,
                      fontWeight: 900,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {pendingAttachment.fileName}
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 800 }}>
                    {pendingAttachment.isUploading ? 'Загружаем...' : 'Готово к отправке'}
                  </div>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Убрать вложение"
                  title="Убрать вложение"
                  onClick={clearPendingAttachment}
                  style={{ width: 30, height: 30, minWidth: 30, minHeight: 30 }}
                >
                  <X size={14} />
                </button>
              </div>
            ) : null
          }
          canSendEmpty={pendingAttachment !== null}
          onAttach={() => attachmentInputRef.current?.click()}
          onClearReply={() => setReplyToComment(null)}
          disabled={
            sendMut.isPending ||
            uploadAttachmentMut.isPending ||
            pendingAttachment?.isUploading === true
          }
          onSend={handleSend}
        />
        {attachmentError !== null && (
          <div
            role="alert"
            style={{
              marginTop: 6,
              padding: '0 4px',
              color: 'var(--red-deep)',
              fontSize: 11,
              fontWeight: 800,
              textAlign: 'center',
            }}
          >
            {attachmentError}
          </div>
        )}
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
      <UserProfileSheet sender={previewSender} onClose={() => setPreviewSender(null)} />
    </main>
  );
}
