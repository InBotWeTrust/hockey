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

export function ChatInput({
  disabled = false,
  replyTo,
  replyToSenderName,
  onClearReply,
  onSend,
}: ChatInputProps): JSX.Element {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow up to a cap.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
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
        margin: '0 12px 12px',
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
            padding: '8px 10px',
            borderRadius: 12,
            background: 'rgba(255,255,255,0.92)',
            color: 'var(--ink)',
            fontSize: 14,
            lineHeight: 1.4,
            maxHeight: 120,
            fontFamily: 'inherit',
          }}
        />
        <button
          type="button"
          className="btn btn--cta"
          onClick={submit}
          disabled={disabled || value.trim().length === 0}
          aria-label="Отправить"
          style={{ padding: 12, borderRadius: 999, minWidth: 44, minHeight: 44 }}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
