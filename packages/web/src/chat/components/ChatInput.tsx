import { useEffect, useRef, useState } from 'react';
import { Bold, Italic, Send } from 'lucide-react';
import type { ChatMessageDTO } from '../api.js';
import { ReplyPreview } from './ReplyPreview.js';

interface ChatInputProps {
  disabled?: boolean;
  replyTo: ChatMessageDTO | null;
  replyToSenderName?: string | undefined;
  placeholder?: string;
  formattingTools?: boolean;
  onClearReply: () => void;
  onSend: (content: string, replyToId: string | null) => void | Promise<void>;
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

export function ChatInput({
  disabled = false,
  replyTo,
  replyToSenderName,
  placeholder = 'Сообщение...',
  formattingTools = false,
  onClearReply,
  onSend,
}: ChatInputProps): JSX.Element {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement | null>(null);
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

  function submit(): void {
    if (disabled || sendingRef.current) return;
    const trimmed = value.trim();
    if (!hasMeaningfulContent(trimmed)) return;
    sendingRef.current = true;
    setValue('');
    onClearReply();
    void onSend(trimmed, replyTo?.id ?? null);
  }

  return (
    <div
      className="glass-dark"
      style={{
        margin: '0 14px 0',
        padding: 10,
        borderRadius: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {replyTo && (
        <ReplyPreview
          variant="composer"
          senderName={replyToSenderName ?? 'Сообщение'}
          content={replyTo.content}
          onClear={onClearReply}
        />
      )}
      {formattingTools && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
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
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, MAX_LEN))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
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
        <button
          type="button"
          className="btn btn--cta"
          onClick={submit}
          disabled={disabled || !hasMeaningfulContent(value)}
          aria-label="Отправить"
          style={{
            padding: 0,
            borderRadius: 999,
            width: ROW_HEIGHT,
            height: ROW_HEIGHT,
            minWidth: ROW_HEIGHT,
            minHeight: ROW_HEIGHT,
            flexShrink: 0,
            letterSpacing: 0,
          }}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
