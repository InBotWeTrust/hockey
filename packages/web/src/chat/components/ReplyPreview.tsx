interface ReplyPreviewProps {
  senderName: string;
  content: string;
  variant?: 'in-bubble' | 'composer';
  tone?: 'light' | 'dark';
  onClick?: () => void;
  onClear?: () => void;
}

export function ReplyPreview({
  senderName,
  content,
  variant = 'in-bubble',
  tone = 'light',
  onClick,
  onClear,
}: ReplyPreviewProps): JSX.Element {
  const isComposer = variant === 'composer';
  const isDark = !isComposer && tone === 'dark';
  const isClickable = onClick !== undefined && !isComposer;
  const previewBackground = isComposer
    ? 'rgba(255,255,255,0.55)'
    : isDark
      ? 'rgba(226, 242, 255, 0.16)'
      : 'rgba(15,23,42,0.06)';
  const previewColor = isDark ? 'rgba(255, 255, 255, 0.9)' : 'var(--ink)';
  const senderColor = isDark ? 'rgba(125, 211, 252, 0.98)' : 'var(--blue-accent)';
  const contentColor = isDark ? 'rgba(255, 255, 255, 0.74)' : 'rgba(15, 23, 42, 0.72)';

  const style = {
    position: 'relative' as const,
    padding: '6px 10px 6px 12px',
    marginBottom: isComposer ? 6 : 4,
    borderRadius: 12,
    background: previewBackground,
    border: 'none',
    width: '100%',
    font: 'inherit',
    fontSize: 11,
    color: previewColor,
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    overflow: 'hidden',
    boxShadow: isDark ? '0 0 0 1px rgba(255,255,255,0.08) inset' : undefined,
    cursor: isClickable ? 'pointer' : 'default',
    textAlign: 'left' as const,
  };

  const contentNode = (
    <>
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          top: 4,
          bottom: 4,
          width: 3,
          borderRadius: 2,
          background: 'var(--blue-accent)',
        }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 11, color: senderColor }}>{senderName}</div>
        <div
          style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: contentColor,
          }}
        >
          {content || '...'}
        </div>
      </div>
      {onClear && (
        <button
          type="button"
          aria-label="Снять ответ"
          onClick={onClear}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--muted)',
            cursor: 'pointer',
            fontSize: 14,
            padding: 0,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      )}
    </>
  );

  if (isClickable) {
    return (
      <button
        type="button"
        data-testid="reply-preview"
        aria-label="Перейти к сообщению"
        onClick={onClick}
        style={style}
      >
        {contentNode}
      </button>
    );
  }

  return (
    <div
      data-testid="reply-preview"
      style={style}
    >
      {contentNode}
    </div>
  );
}
