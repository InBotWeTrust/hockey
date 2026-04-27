import { Reply, Trash2 } from 'lucide-react';

interface MessageActionsProps {
  isOwn: boolean;
  disabled?: boolean;
  onReply: () => void;
  onDelete?: () => void; // only meaningful when isOwn
}

export function MessageActions({
  isOwn,
  disabled = false,
  onReply,
  onDelete,
}: MessageActionsProps): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        opacity: disabled ? 0 : 0.6,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      <button
        type="button"
        className="icon-btn"
        aria-label="Ответить"
        onClick={onReply}
        style={{ width: 24, height: 24 }}
      >
        <Reply size={12} />
      </button>
      {isOwn && onDelete && (
        <button
          type="button"
          className="icon-btn"
          aria-label="Удалить сообщение"
          onClick={onDelete}
          style={{ width: 24, height: 24 }}
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}
