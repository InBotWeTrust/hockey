import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import type { ChatMessageDTO } from '../api.js';
import { ReplyPreview } from './ReplyPreview.js';

interface ChatInputProps {
  disabled?: boolean;
  replyTo: ChatMessageDTO | null;
  replyToSenderName?: string | undefined;
  onClearReply: () => void;
  onSend: (content: string, replyToId: string | null) => void | Promise<void>;
}

const MAX_LEN = 4000;
const ROW_HEIGHT = 40;

export function ChatInput({
  disabled = false,
  replyTo,
  replyToSenderName,
  onClearReply,
  onSend,
}: ChatInputProps): JSX.Element {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow: at single-row use fixed line-height = 40 (visually centered);
  // when content overflows, switch to padded multi-line mode up to 120.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Reset to base to measure content height correctly.
    el.style.height = `${ROW_HEIGHT}px`;
    el.style.lineHeight = `${ROW_HEIGHT}px`;
    el.style.padding = '0 14px';
    if (el.scrollHeight > ROW_HEIGHT) {
      el.style.lineHeight = '1.4';
      el.style.padding = '10px 14px';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }, [value]);

  function submit(): void {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    void onSend(trimmed, replyTo?.id ?? null);
    setValue('');
    onClearReply();
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
          placeholder="Сообщение..."
          rows={1}
          disabled={disabled}
          aria-label="Текст сообщения"
          style={{
            flex: 1,
            resize: 'none',
            border: 'none',
            outline: 'none',
            padding: '0 14px',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.92)',
            color: 'var(--ink)',
            fontSize: 14,
            lineHeight: `${ROW_HEIGHT}px`,
            height: ROW_HEIGHT,
            minHeight: ROW_HEIGHT,
            maxHeight: 120,
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
        <button
          type="button"
          className="btn btn--cta"
          onClick={submit}
          disabled={disabled || value.trim().length === 0}
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
