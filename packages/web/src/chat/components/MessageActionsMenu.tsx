import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Reply, Trash2, SmilePlus } from 'lucide-react';
import { FAVORITE_EMOJI } from '../reactions.js';

interface Props {
  open: boolean;
  anchorRect: DOMRect | null;
  isOwn: boolean;
  onReply: () => void;
  onDelete: () => void;
  onPickEmoji?: (emoji: string) => void;
  onMoreEmoji?: () => void;
  onClose: () => void;
}

const PANEL_GAP = 8;
const SAFE_MARGIN = 12;
const PANEL_WIDTH = 320;
// Heights include the new 44px shelf (emojis + `+` button + dividers).
const PANEL_HEIGHT_OWN = 140;
const PANEL_HEIGHT_OTHER = 92;

function panelPosition(anchor: DOMRect, height: number): { top: number; left: number } {
  const above = anchor.top - height - PANEL_GAP;
  const below = anchor.bottom + PANEL_GAP;
  const maxTop = window.innerHeight - height - SAFE_MARGIN;
  let top: number;
  if (above >= SAFE_MARGIN) top = above;
  else if (below <= maxTop) top = below;
  else top = Math.max(SAFE_MARGIN, maxTop);
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
  onPickEmoji,
  onMoreEmoji,
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 6px',
            borderBottom: '1px solid rgba(15,23,42,0.06)',
          }}
        >
          {FAVORITE_EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              aria-label={e}
              onClick={() => {
                onPickEmoji?.(e);
                onClose();
              }}
              style={{
                flex: 1,
                height: 32,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 20,
                padding: 0,
                lineHeight: 1,
                borderRadius: 8,
              }}
            >
              {e}
            </button>
          ))}
          <button
            type="button"
            aria-label="Ещё реакции"
            onClick={() => onMoreEmoji?.()}
            style={{
              width: 32,
              height: 32,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              padding: 0,
              borderRadius: 8,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ink)',
            }}
          >
            <SmilePlus size={18} />
          </button>
        </div>

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
