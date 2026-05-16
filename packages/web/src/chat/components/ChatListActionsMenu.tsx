import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Megaphone, MegaphoneOff, Pin, PinOff } from 'lucide-react';

interface Props {
  open: boolean;
  anchorRect: DOMRect | null;
  isPinned: boolean;
  showPinAction?: boolean;
  showNotificationAction?: boolean;
  notificationsMuted?: boolean;
  notificationPending?: boolean;
  onTogglePin: () => void;
  onToggleNotifications?: () => void;
  onClose: () => void;
}

const PANEL_GAP = 8;
const SAFE_MARGIN = 12;
const PANEL_WIDTH = 220;
const MENU_ITEM_HEIGHT = 52;

function panelPosition(anchor: DOMRect, panelHeight: number): { top: number; left: number } {
  const above = anchor.top - panelHeight - PANEL_GAP;
  const below = anchor.bottom + PANEL_GAP;
  const maxTop = window.innerHeight - panelHeight - SAFE_MARGIN;
  let top: number;
  if (above >= SAFE_MARGIN) top = above;
  else if (below <= maxTop) top = below;
  else top = Math.max(SAFE_MARGIN, maxTop);
  const wantedLeft = anchor.left + anchor.width / 2 - PANEL_WIDTH / 2;
  const maxLeft = window.innerWidth - PANEL_WIDTH - SAFE_MARGIN;
  const left = Math.min(Math.max(SAFE_MARGIN, wantedLeft), Math.max(SAFE_MARGIN, maxLeft));
  return { top, left };
}

export function ChatListActionsMenu({
  open,
  anchorRect,
  isPinned,
  showPinAction = true,
  showNotificationAction = false,
  notificationsMuted = false,
  notificationPending = false,
  onTogglePin,
  onToggleNotifications,
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

  const actionsCount = Number(showPinAction) + Number(showNotificationAction);
  if (!open || !anchorRect || actionsCount === 0) return null;
  const pos = panelPosition(anchorRect, actionsCount * MENU_ITEM_HEIGHT + 12);

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
        aria-label="Действия с чатом"
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
          zIndex: 801,
          boxShadow: '0 12px 30px rgba(15, 23, 42, 0.22)',
        }}
      >
        {showPinAction && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onTogglePin();
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
            {isPinned ? <PinOff size={16} /> : <Pin size={16} />}
            {isPinned ? 'Открепить' : 'Закрепить'}
          </button>
        )}
        {showNotificationAction && (
          <button
            type="button"
            role="menuitem"
            disabled={notificationPending}
            onClick={() => {
              onToggleNotifications?.();
              onClose();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              border: 'none',
              background: 'transparent',
              color: notificationPending ? 'var(--muted)' : 'var(--ink)',
              fontSize: 14,
              cursor: notificationPending ? 'default' : 'pointer',
              borderRadius: 12,
              textAlign: 'left',
            }}
          >
            {notificationsMuted ? <Megaphone size={16} /> : <MegaphoneOff size={16} />}
            {notificationsMuted ? 'Включить уведомления' : 'Выключить уведомления'}
          </button>
        )}
      </div>
    </>,
    document.body,
  );
}
