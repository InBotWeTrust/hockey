import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ListChecks, Plus, Trash2, X } from 'lucide-react';

interface ChannelPollComposerSheetProps {
  open: boolean;
  disabled?: boolean;
  onSubmit: (question: string, options: string[]) => void;
  onClose: () => void;
}

const QUESTION_MAX_LEN = 4000;
const OPTION_MAX_LEN = 160;

function filledOptions(values: string[]): string[] {
  return values
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .slice(0, 3);
}

export function ChannelPollComposerSheet({
  open,
  disabled = false,
  onSubmit,
  onClose,
}: ChannelPollComposerSheetProps): JSX.Element | null {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);

  useEffect(() => {
    if (!open) return;
    setQuestion('');
    setOptions(['', '']);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const trimmedQuestion = question.trim();
  const submittedOptions = filledOptions(options);
  const canSubmit = trimmedQuestion.length > 0 && submittedOptions.length >= 1 && !disabled;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Создание опроса"
      onPointerDown={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 950,
        background: 'rgba(15, 23, 42, 0.35)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'flex-end',
        padding: '16px 14px max(16px, var(--app-safe-bottom))',
      }}
    >
      <div
        className="glass"
        onPointerDown={(event) => event.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          margin: '0 auto',
          borderRadius: 22,
          padding: 14,
          color: 'var(--ink)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            aria-hidden
            className="icon-btn"
            style={{
              width: 34,
              height: 34,
              minWidth: 34,
              minHeight: 34,
              borderRadius: 10,
              background: 'rgba(255,255,255,0.72)',
              color: 'var(--ink)',
            }}
          >
            <ListChecks size={16} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 950 }}>Опрос</div>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="icon-btn"
            aria-label="Закрыть"
            disabled={disabled}
            onClick={onClose}
            style={{
              width: 34,
              height: 34,
              minWidth: 34,
              minHeight: 34,
              borderRadius: 10,
              background: 'rgba(255,255,255,0.72)',
              color: 'var(--ink)',
            }}
          >
            <X size={16} />
          </button>
        </div>

        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value.slice(0, QUESTION_MAX_LEN))}
          disabled={disabled}
          aria-label="Вопрос опроса"
          placeholder="Вопрос опроса..."
          rows={4}
          style={{
            width: '100%',
            resize: 'vertical',
            minHeight: 96,
            maxHeight: '35dvh',
            border: '1px solid rgba(255,255,255,0.74)',
            outline: 'none',
            borderRadius: 16,
            padding: 12,
            background: 'rgba(255,255,255,0.88)',
            color: 'var(--ink)',
            fontSize: 15,
            lineHeight: 1.45,
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />

        <div style={{ display: 'grid', gap: 8 }}>
          {options.map((option, index) => (
            <div
              key={index}
              style={{
                display: 'grid',
                gridTemplateColumns: options.length > 1 ? 'minmax(0, 1fr) 34px' : 'minmax(0, 1fr)',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <input
                value={option}
                onChange={(event) => {
                  const next = [...options];
                  next[index] = event.target.value.slice(0, OPTION_MAX_LEN);
                  setOptions(next);
                }}
                disabled={disabled}
                aria-label={`Вариант ${index + 1}`}
                placeholder={`Вариант ${index + 1}`}
                style={{
                  height: 40,
                  border: '1px solid rgba(255,255,255,0.74)',
                  outline: 'none',
                  borderRadius: 14,
                  padding: '0 12px',
                  background: 'rgba(255,255,255,0.88)',
                  color: 'var(--ink)',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
              {options.length > 1 && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Удалить вариант ${index + 1}`}
                  disabled={disabled}
                  onClick={() => setOptions((current) => current.filter((_, i) => i !== index))}
                  style={{
                    width: 34,
                    height: 34,
                    minWidth: 34,
                    minHeight: 34,
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.72)',
                    color: 'var(--red-deep)',
                  }}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </div>

        {options.length < 3 && (
          <button
            type="button"
            className="btn btn--ghost"
            disabled={disabled}
            onClick={() => setOptions((current) => [...current, ''])}
            style={{ minHeight: 40, letterSpacing: 0 }}
          >
            <Plus size={16} />
            Добавить вариант
          </button>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={disabled}
            onClick={onClose}
            style={{ flex: 1, minHeight: 44, letterSpacing: 0 }}
          >
            <X size={16} />
            Отмена
          </button>
          <button
            type="button"
            className="btn btn--cta"
            disabled={!canSubmit}
            onClick={() => {
              onSubmit(trimmedQuestion, submittedOptions);
              onClose();
            }}
            style={{ flex: 1, minHeight: 44, letterSpacing: 0 }}
          >
            <Check size={16} />
            Опубликовать
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
