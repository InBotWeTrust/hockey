import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bold, Check, Italic, Trash2, X } from 'lucide-react';
interface ChannelPostEditorSheetProps {
  post: { id: string; content: string } | null;
  disabled?: boolean;
  deleteDisabled?: boolean;
  onSave: (postId: string, content: string) => void;
  onDelete?: (postId: string) => void;
  onClose: () => void;
}

const MAX_LEN = 4000;

function hasMeaningfulContent(value: string): boolean {
  return value.replace(/\*\*|__/g, '').trim().length > 0;
}

export function ChannelPostEditorSheet({
  post,
  disabled = false,
  deleteDisabled = false,
  onSave,
  onDelete,
  onClose,
}: ChannelPostEditorSheetProps): JSX.Element | null {
  const [value, setValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setValue(post?.content ?? '');
    setConfirmDelete(false);
  }, [post]);

  useEffect(() => {
    if (!post) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [post, onClose]);

  if (!post) return null;

  function applyInlineFormat(marker: '**' | '__'): void {
    if (disabled) return;
    const textarea = textareaRef.current;
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
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextSelectionStart, nextSelectionEnd);
    }, 0);
  }

  const trimmed = value.trim();
  const canSave = hasMeaningfulContent(trimmed) && trimmed !== post.content && !disabled;
  const deleteActionDisabled = disabled || deleteDisabled;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Редактирование поста"
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="icon-btn"
            aria-label="Жирный"
            title="Жирный"
            disabled={disabled}
            onClick={() => applyInlineFormat('**')}
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
            <Bold size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Курсив"
            title="Курсив"
            disabled={disabled}
            onClick={() => applyInlineFormat('__')}
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
            <Italic size={16} />
          </button>
          <div style={{ flex: 1 }} />
          {onDelete && (
            <button
              type="button"
              className="icon-btn"
              aria-label="Удалить пост"
              title="Удалить пост"
              disabled={deleteActionDisabled}
              onClick={() => setConfirmDelete(true)}
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
              <Trash2 size={16} />
            </button>
          )}
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
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value.slice(0, MAX_LEN))}
          disabled={disabled}
          aria-label="Текст поста"
          rows={7}
          style={{
            width: '100%',
            resize: 'vertical',
            minHeight: 150,
            maxHeight: '45dvh',
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

        {confirmDelete && onDelete && (
          <div
            className="glass"
            role="alertdialog"
            aria-label="Подтверждение удаления поста"
            style={{
              borderRadius: 16,
              padding: 12,
              display: 'grid',
              gap: 10,
              background: 'rgba(255,255,255,0.58)',
            }}
          >
            <div style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 950 }}>
              Удалить этот пост?
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 750, lineHeight: 1.35 }}>
              Пост исчезнет из новостного канала.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={deleteActionDisabled}
                onClick={() => setConfirmDelete(false)}
                style={{ minHeight: 40, letterSpacing: 0 }}
              >
                Отмена
              </button>
              <button
                type="button"
                className="btn btn--cta"
                disabled={deleteActionDisabled}
                onClick={() => onDelete(post.id)}
                style={{
                  minHeight: 40,
                  letterSpacing: 0,
                  background: 'var(--red-deep)',
                  color: '#ffffff',
                }}
              >
                <Trash2 size={15} />
                Удалить
              </button>
            </div>
          </div>
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
            disabled={!canSave}
            onClick={() => onSave(post.id, trimmed)}
            style={{ flex: 1, minHeight: 44, letterSpacing: 0 }}
          >
            <Check size={16} />
            Сохранить
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
