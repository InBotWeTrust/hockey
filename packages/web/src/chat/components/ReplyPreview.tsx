interface ReplyPreviewProps {
  senderName: string;
  content: string;
  variant?: 'in-bubble' | 'composer';
  onClear?: () => void;
}

export function ReplyPreview({
  senderName,
  content,
  variant = 'in-bubble',
  onClear,
}: ReplyPreviewProps): JSX.Element {
  const isComposer = variant === 'composer';
  return (
    <div
      style={{
        position: 'relative',
        padding: '6px 10px 6px 12px',
        marginBottom: isComposer ? 6 : 4,
        borderRadius: 12,
        background: isComposer ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.06)',
        opacity: isComposer ? 1 : 0.85,
        fontSize: 11,
        color: 'var(--ink)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        overflow: 'hidden',
      }}
    >
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
        <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--blue-accent)' }}>
          {senderName}
        </div>
        <div
          style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            opacity: 0.8,
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
    </div>
  );
}
