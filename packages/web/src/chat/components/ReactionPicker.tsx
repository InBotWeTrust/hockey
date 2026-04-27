import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { EMOJI_WHITELIST } from '../reactions.js';

interface Props {
  open: boolean;
  anchorRect: DOMRect | null;
  onPick: (emoji: string) => void;
  onClose: () => void;
}

const PANEL_WIDTH = 280;
const PANEL_HEIGHT = 144;
const PANEL_GAP = 8;
const SAFE_MARGIN = 12;

function panelPosition(anchor: DOMRect): { top: number; left: number } {
  const above = anchor.top - PANEL_HEIGHT - PANEL_GAP;
  const below = anchor.bottom + PANEL_GAP;
  const maxTop = window.innerHeight - PANEL_HEIGHT - SAFE_MARGIN;
  const top =
    above >= SAFE_MARGIN
      ? above
      : below <= maxTop
      ? below
      : Math.max(SAFE_MARGIN, maxTop);
  const wantedLeft = anchor.left + anchor.width / 2 - PANEL_WIDTH / 2;
  const maxLeft = window.innerWidth - PANEL_WIDTH - SAFE_MARGIN;
  const left = Math.min(Math.max(SAFE_MARGIN, wantedLeft), Math.max(SAFE_MARGIN, maxLeft));
  return { top, left };
}

export function ReactionPicker({
  open,
  anchorRect,
  onPick,
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
  const pos = panelPosition(anchorRect);

  return createPortal(
    <>
      <div
        data-reaction-picker-backdrop
        aria-hidden
        onPointerDown={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.04)', zIndex: 850 }}
      />
      <div
        role="dialog"
        aria-label="Выбор реакции"
        className="glass"
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          width: PANEL_WIDTH,
          padding: 8,
          borderRadius: 16,
          display: 'grid',
          gridTemplateColumns: 'repeat(8, 1fr)',
          gap: 6,
          zIndex: 851,
          boxShadow: '0 12px 30px rgba(15, 23, 42, 0.22)',
        }}
      >
        {EMOJI_WHITELIST.map((e) => (
          <button
            key={e}
            type="button"
            aria-label={e}
            onClick={() => {
              onPick(e);
              onClose();
            }}
            style={{
              width: 28,
              height: 28,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 22,
              padding: 0,
              lineHeight: 1,
            }}
          >
            {e}
          </button>
        ))}
      </div>
    </>,
    document.body,
  );
}
