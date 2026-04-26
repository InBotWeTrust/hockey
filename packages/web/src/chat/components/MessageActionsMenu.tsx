import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Reply, Trash2 } from 'lucide-react';

interface Props {
  open: boolean;
  anchorRect: DOMRect | null;
  isOwn: boolean;
  onReply: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const PANEL_GAP = 8;
const SAFE_MARGIN = 12;
const PANEL_WIDTH = 168;
const PANEL_HEIGHT_OWN = 96;
const PANEL_HEIGHT_OTHER = 48;

function panelPosition(anchor: DOMRect, height: number): { top: number; left: number } {
  const above = anchor.top - height - PANEL_GAP;
  const below = anchor.bottom + PANEL_GAP;
  const maxTop = window.innerHeight - height - SAFE_MARGIN;
  let top: number;
  if (above >= SAFE_MARGIN) {
    top = above;
  } else if (below <= maxTop) {
    top = below;
  } else {
    top = Math.max(SAFE_MARGIN, maxTop);
  }
  const wantedLeft = anchor.left + anchor.width / 2 - PANEL_WIDTH / 2;
  const maxLeft = window.innerWidth - PANEL_WIDTH - SAFE_MARGIN;
  const left = Math.min(Math.max(SAFE_MARGIN, wantedLeft), Math.max(SAFE_MARGIN, maxLeft));
  return { top, left };
}

export function MessageActionsMenu({
  open,
  anchorRect,
  isOwn,
  onReply,
  onDelete,
  onClose,
}: Props): JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !anchorRect) return null;

  const height = isOwn ? PANEL_HEIGHT_OWN : PANEL_HEIGHT_OTHER;
  const pos = panelPosition(anchorRect, height);

  return createPortal(
    <>
      <div
        aria-hidden
        onPointerDown={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15,23,42,0.04)',
          zIndex: 800,
        }}
      />
      <div
        role="menu"
        aria-label="Действия с сообщением"
        className="glass"
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          width: PANEL_WIDTH,
          padding: 6,
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          zIndex: 801,
          boxShadow: '0 12px 30px rgba(15, 23, 42, 0.22)',
        }}
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onReply();
            onClose();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            border: 'none',
            background: 'transparent',
            color: 'var(--ink)',
            fontSize: 14,
            cursor: 'pointer',
            borderRadius: 12,
            textAlign: 'left',
          }}
        >
          <Reply size={16} />
          Ответить
        </button>
        {isOwn && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onDelete();
              onClose();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              border: 'none',
              background: 'transparent',
              color: 'rgb(220, 38, 38)',
              fontSize: 14,
              cursor: 'pointer',
              borderRadius: 12,
              textAlign: 'left',
            }}
          >
            <Trash2 size={16} />
            Удалить
          </button>
        )}
      </div>
    </>,
    document.body,
  );
}
