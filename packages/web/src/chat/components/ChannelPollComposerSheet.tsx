import { useEffect, useState } from 'react';
import { ListChecks, Trash2, X } from 'lucide-react';
import { Sheet } from '../../components/Sheet.js';

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
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuestion('');
    setOptions(['', '']);
    setConfirmDiscard(false);
  }, [open]);

  if (!open) return null;

  const trimmedQuestion = question.trim();
  const submittedOptions = filledOptions(options);
  const canSubmit = trimmedQuestion.length > 0 && submittedOptions.length >= 1 && !disabled;
  const dirty = question.length > 0 || options.some((option) => option.length > 0);
  const requestClose = (): void => {
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  return (
    <Sheet
      open
      title="Создание опроса"
      dirty={dirty}
      dismissible={!disabled}
      onRequestClose={requestClose}
    >
      <div
        style={{
          width: '100%',
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
            onClick={requestClose}
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
            Добавить вариант
          </button>
        )}

        {confirmDiscard && (
          <div className="glass" role="alertdialog" aria-label="Несохранённые изменения">
            <div className="modal-title">Закрыть без сохранения?</div>
            <div className="modal-copy">Черновик опроса будет потерян.</div>
            <div className="modal-actions" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setConfirmDiscard(false)}
              >
                Продолжить
              </button>
              <button type="button" className="btn btn--cta" onClick={onClose}>
                Закрыть
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={disabled}
            onClick={requestClose}
            style={{ flex: 1, minHeight: 44, letterSpacing: 0 }}
          >
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
            Опубликовать
          </button>
        </div>
      </div>
    </Sheet>
  );
}
