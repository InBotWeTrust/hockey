import { useEffect, useRef, useState } from 'react';
import type { ClipboardEvent, CSSProperties, ReactNode } from 'react';
import {
  Bold,
  File as FileIcon,
  Image as ImageIcon,
  Italic,
  Mic,
  Paperclip,
  Send,
  Square,
} from 'lucide-react';
import { ReplyPreview } from './ReplyPreview.js';

export interface ChatInputReplyTarget {
  id: string;
  content: string;
}

export interface ChatInputEditTarget {
  id: string;
  content: string;
}

interface ChatInputProps {
  disabled?: boolean;
  replyTo: ChatInputReplyTarget | null;
  editing?: ChatInputEditTarget | null;
  replyToSenderName?: string | undefined;
  placeholder?: string;
  formattingTools?: boolean;
  extraTools?: ReactNode;
  attachmentPreview?: ReactNode;
  canSendEmpty?: boolean;
  onAttach?: () => void;
  onAttachImage?: () => void;
  onAttachFile?: () => void;
  onPasteImage?: (file: File) => void;
  onVoice?: () => void;
  voiceState?: 'idle' | 'recording' | 'uploading';
  onClearReply: () => void;
  onClearEditing?: () => void;
  onSend: (content: string, replyToId: string | null) => void | Promise<void>;
  onEdit?: (messageId: string, content: string) => void | Promise<void>;
}

const MAX_LEN = 4000;
const ROW_HEIGHT = 40;
// Clamp auto-grow at 4 visible lines: 14px font * 1.4 line-height ≈ 19.6px,
// 4 lines ≈ 78.4px + 20px (top+bottom padding) ≈ 98.4 → round to 100. Past
// this height the textarea owns its own internal scroll.
const MULTILINE_MAX_HEIGHT = 100;
const CORNER_RADIUS = 20;

function hasMeaningfulContent(value: string): boolean {
  return value.replace(/\*\*|__/g, '').trim().length > 0;
}

function shouldSubmitOnEnter(): boolean {
  if (typeof window.matchMedia !== 'function') return true;
  return !window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

export function ChatInput({
  disabled = false,
  replyTo,
  editing = null,
  replyToSenderName,
  placeholder = 'Сообщение...',
  formattingTools = false,
  extraTools,
  attachmentPreview,
  canSendEmpty = false,
  onAttach,
  onAttachImage,
  onAttachFile,
  onPasteImage,
  onVoice,
  voiceState = 'idle',
  onClearReply,
  onClearEditing,
  onSend,
  onEdit,
}: ChatInputProps): JSX.Element {
  const [value, setValue] = useState('');
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);
  // Synchronous guard against double-tap: the parent flips `disabled` only
  // after the next render once `sendMut.isPending` propagates, leaving a
  // small window where two taps can fire submit() with the same closure
  // value. A ref blocks the second call immediately.
  const sendingRef = useRef(false);

  // Reset the in-flight guard whenever the parent reports the mutation has
  // settled (`disabled` flips from true → false). The disabled→false edge
  // is the safe moment to allow a new send.
  useEffect(() => {
    if (!disabled) sendingRef.current = false;
  }, [disabled]);

  useEffect(() => {
    if (!attachMenuOpen) return;
    const close = (event: PointerEvent): void => {
      const node = attachMenuRef.current;
      if (node && event.target instanceof Node && node.contains(event.target)) return;
      setAttachMenuOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [attachMenuOpen]);

  useEffect(() => {
    if (!replyTo) return;
    ref.current?.focus();
  }, [replyTo]);

  useEffect(() => {
    if (!editing) return;
    setValue(editing.content.slice(0, MAX_LEN));
    ref.current?.focus();
    window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
    }, 0);
  }, [editing]);

  // Auto-grow: single-row uses line-height=40 for vertical centering. Once the
  // content needs more than one row, switch to padded multi-line mode capped
  // at MULTILINE_MAX_HEIGHT (~4 lines); beyond that the textarea owns its own
  // scrollbar so the input doesn't push the messages list off-screen.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = `${ROW_HEIGHT}px`;
    el.style.lineHeight = `${ROW_HEIGHT}px`;
    el.style.padding = '0 14px';
    el.style.overflowY = 'hidden';
    if (el.scrollHeight > ROW_HEIGHT) {
      el.style.lineHeight = '1.4';
      el.style.padding = '10px 14px';
      const next = Math.min(el.scrollHeight, MULTILINE_MAX_HEIGHT);
      el.style.height = `${next}px`;
      el.style.overflowY = el.scrollHeight > MULTILINE_MAX_HEIGHT ? 'auto' : 'hidden';
    }
  }, [value]);

  function applyInlineFormat(marker: '**' | '__'): void {
    if (disabled) return;
    const textarea = ref.current;
    const selectionStart = textarea?.selectionStart ?? value.length;
    const selectionEnd = textarea?.selectionEnd ?? value.length;
    const before = value.slice(0, selectionStart);
    const selected = value.slice(selectionStart, selectionEnd);
    const after = value.slice(selectionEnd);
    const next = `${before}${marker}${selected}${marker}${after}`.slice(0, MAX_LEN);
    const nextSelectionStart = Math.min(selectionStart + marker.length, next.length);
    const nextSelectionEnd = Math.min(nextSelectionStart + selected.length, next.length);

    setValue(next);
    window.setTimeout(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(nextSelectionStart, nextSelectionEnd);
    }, 0);
  }

  function fileFromClipboardItem(item: DataTransferItem, index: number): File | null {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) return null;
    const file = item.getAsFile();
    if (!file) return null;
    if (file.name.length > 0) return file;
    const extension =
      item.type === 'image/png' ? 'png' : item.type === 'image/webp' ? 'webp' : 'jpg';
    return new File([file], `clipboard-image-${index + 1}.${extension}`, {
      type: file.type || item.type || 'image/png',
      lastModified: Date.now(),
    });
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>): void {
    if (!onPasteImage || disabled || editing) return;
    const items = Array.from(event.clipboardData.items ?? []);
    const itemImage = items
      .map((item, index) => fileFromClipboardItem(item, index))
      .find((file): file is File => file !== null);
    const fileImage =
      itemImage ??
      Array.from(event.clipboardData.files ?? []).find((file) => file.type.startsWith('image/')) ??
      null;
    if (!fileImage) return;
    event.preventDefault();
    onPasteImage(fileImage);
  }

  async function submit(): Promise<void> {
    if (disabled || sendingRef.current) return;
    const trimmed = value.trim();
    const hasText = hasMeaningfulContent(trimmed);
    if (!hasText && !canSendEmpty) return;
    if (editing && !hasText) return;
    sendingRef.current = true;

    try {
      if (editing && onEdit) {
        await onEdit(editing.id, trimmed);
        setValue('');
        onClearReply();
        onClearEditing?.();
        return;
      }
      await onSend(trimmed, replyTo?.id ?? null);
      setValue('');
      onClearReply();
    } catch {
      sendingRef.current = false;
      ref.current?.focus();
    }
  }

  const canSend = hasMeaningfulContent(value) || canSendEmpty;
  const showVoiceAction = onVoice !== undefined && !editing && !canSend;
  const hasAttachmentChoices = onAttachImage !== undefined || onAttachFile !== undefined;
  const showAttachmentAction = onAttach !== undefined || hasAttachmentChoices;
  const voiceLabel =
    voiceState === 'recording'
      ? 'Остановить запись'
      : voiceState === 'uploading'
        ? 'Отправляем голосовое'
        : 'Записать голосовое';
  const iconButtonStyle = {
    width: ROW_HEIGHT,
    height: ROW_HEIGHT,
    minWidth: ROW_HEIGHT,
    minHeight: ROW_HEIGHT,
    borderRadius: 999,
    padding: 0,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  } satisfies CSSProperties;

  return (
    <div className="chat-dock-composer glass-dock-surface">
      {editing && (
        <ReplyPreview
          variant="composer"
          senderName="Редактирование"
          content={editing.content}
          onClear={() => {
            setValue('');
            onClearEditing?.();
          }}
        />
      )}
      {replyTo && (
        <ReplyPreview
          variant="composer"
          senderName={replyToSenderName ?? 'Сообщение'}
          content={replyTo.content}
          onClear={onClearReply}
        />
      )}
      {attachmentPreview}
      {(formattingTools || extraTools) && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {formattingTools && (
            <>
              <button
                type="button"
                className="icon-btn"
                title="Жирный"
                aria-label="Жирный"
                disabled={disabled}
                onClick={() => applyInlineFormat('**')}
                style={{
                  width: 32,
                  height: 32,
                  minWidth: 32,
                  minHeight: 32,
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.88)',
                  color: 'var(--ink)',
                }}
              >
                <Bold size={16} />
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Курсив"
                aria-label="Курсив"
                disabled={disabled}
                onClick={() => applyInlineFormat('__')}
                style={{
                  width: 32,
                  height: 32,
                  minWidth: 32,
                  minHeight: 32,
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.88)',
                  color: 'var(--ink)',
                }}
              >
                <Italic size={16} />
              </button>
            </>
          )}
          {extraTools && <div style={{ marginLeft: 'auto' }}>{extraTools}</div>}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        {showAttachmentAction && (
          <div ref={attachMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              type="button"
              className="icon-btn glass-dock-icon"
              title="Прикрепить"
              aria-label="Прикрепить"
              disabled={disabled}
              onClick={() => {
                if (hasAttachmentChoices) {
                  setAttachMenuOpen((open) => !open);
                  return;
                }
                onAttach?.();
              }}
              style={iconButtonStyle}
            >
              <Paperclip size={17} />
            </button>
            {hasAttachmentChoices && attachMenuOpen && (
              <div
                role="menu"
                aria-label="Выбор вложения"
                className="glass"
                style={{
                  position: 'absolute',
                  left: 0,
                  bottom: `calc(${ROW_HEIGHT}px + 8px)`,
                  zIndex: 40,
                  display: 'grid',
                  gap: 6,
                  minWidth: 176,
                  padding: 8,
                  borderRadius: 18,
                  boxShadow:
                    '0 16px 36px rgba(15, 23, 42, 0.22), inset 0 1px 0 rgba(255,255,255,0.55)',
                }}
              >
                {onAttachImage && (
                  <button
                    type="button"
                    role="menuitem"
                    className="icon-btn"
                    onClick={() => {
                      setAttachMenuOpen(false);
                      onAttachImage();
                    }}
                    style={{
                      justifyContent: 'flex-start',
                      width: '100%',
                      minWidth: 0,
                      height: 40,
                      minHeight: 40,
                      padding: '0 12px',
                      gap: 10,
                      borderRadius: 14,
                      color: 'var(--ink)',
                      fontSize: 13,
                      fontWeight: 900,
                    }}
                  >
                    <ImageIcon size={17} />
                    Изображение
                  </button>
                )}
                {onAttachFile && (
                  <button
                    type="button"
                    role="menuitem"
                    className="icon-btn"
                    onClick={() => {
                      setAttachMenuOpen(false);
                      onAttachFile();
                    }}
                    style={{
                      justifyContent: 'flex-start',
                      width: '100%',
                      minWidth: 0,
                      height: 40,
                      minHeight: 40,
                      padding: '0 12px',
                      gap: 10,
                      borderRadius: 14,
                      color: 'var(--ink)',
                      fontSize: 13,
                      fontWeight: 900,
                    }}
                  >
                    <FileIcon size={17} />
                    Файл
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, MAX_LEN))}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && shouldSubmitOnEnter()) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={placeholder}
          rows={1}
          disabled={disabled}
          aria-label="Текст сообщения"
          className="no-scrollbar"
          style={{
            flex: 1,
            resize: 'none',
            border: 'none',
            outline: 'none',
            padding: '0 14px',
            // Fixed corner radius: stays consistent regardless of textarea
            // height (the previous `999` produced an ever-rounder pill that
            // grew "less square" as the box got taller).
            borderRadius: CORNER_RADIUS,
            background: 'rgba(255,255,255,0.92)',
            color: 'var(--ink)',
            fontSize: 14,
            lineHeight: `${ROW_HEIGHT}px`,
            height: ROW_HEIGHT,
            minHeight: ROW_HEIGHT,
            maxHeight: MULTILINE_MAX_HEIGHT,
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
        {showVoiceAction ? (
          <button
            type="button"
            className={
              voiceState === 'recording' ? 'icon-btn icon-btn--dark' : 'icon-btn glass-dock-icon'
            }
            onClick={onVoice}
            disabled={disabled || voiceState === 'uploading'}
            aria-label={voiceLabel}
            title={voiceLabel}
            style={{
              ...iconButtonStyle,
              letterSpacing: 0,
            }}
          >
            {voiceState === 'recording' ? (
              <Square size={15} fill="currentColor" aria-hidden="true" />
            ) : (
              <Mic size={17} aria-hidden="true" />
            )}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--cta"
            onClick={() => void submit()}
            disabled={disabled || !canSend}
            aria-label="Отправить"
            style={{
              ...iconButtonStyle,
              letterSpacing: 0,
            }}
          >
            <Send size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
