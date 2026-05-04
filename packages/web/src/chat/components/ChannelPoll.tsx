import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { XCircle } from 'lucide-react';
import type { ChannelPollDTO } from '../api.js';
import { useLongPress } from '../useLongPress.js';

interface ChannelPollProps {
  postId: string;
  poll: ChannelPollDTO;
  disabled?: boolean;
  onVote: (postId: string, optionId: string) => void;
  onClearVote: (postId: string) => void;
}

interface PollVoteActionsMenuProps {
  anchorRect: DOMRect | null;
  onClearVote: () => void;
  onClose: () => void;
}

const MENU_WIDTH = 220;
const MENU_HEIGHT = 58;
const MENU_GAP = 8;
const SAFE_MARGIN = 12;

function menuPosition(anchor: DOMRect): { top: number; left: number } {
  const above = anchor.top - MENU_HEIGHT - MENU_GAP;
  const below = anchor.bottom + MENU_GAP;
  const maxTop = window.innerHeight - MENU_HEIGHT - SAFE_MARGIN;
  const top =
    above >= SAFE_MARGIN ? above : below <= maxTop ? below : Math.max(SAFE_MARGIN, maxTop);
  const wantedLeft = anchor.left + anchor.width / 2 - MENU_WIDTH / 2;
  const maxLeft = window.innerWidth - MENU_WIDTH - SAFE_MARGIN;
  const left = Math.min(Math.max(SAFE_MARGIN, wantedLeft), Math.max(SAFE_MARGIN, maxLeft));
  return { top, left };
}

function formatVotes(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} голос`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} голоса`;
  return `${count} голосов`;
}

function PollVoteActionsMenu({
  anchorRect,
  onClearVote,
  onClose,
}: PollVoteActionsMenuProps): JSX.Element | null {
  useEffect(() => {
    if (!anchorRect) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [anchorRect, onClose]);

  if (!anchorRect) return null;
  const pos = menuPosition(anchorRect);

  return createPortal(
    <>
      <div
        aria-hidden
        onPointerDown={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15,23,42,0.04)',
          zIndex: 840,
        }}
      />
      <div
        role="menu"
        aria-label="Действия с голосом"
        className="glass"
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          width: MENU_WIDTH,
          padding: 6,
          borderRadius: 16,
          zIndex: 841,
          boxShadow: '0 12px 30px rgba(15, 23, 42, 0.22)',
        }}
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClearVote();
            onClose();
          }}
          style={{
            width: '100%',
            minHeight: 44,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            border: 'none',
            background: 'transparent',
            color: 'rgb(220, 38, 38)',
            fontSize: 14,
            fontWeight: 850,
            cursor: 'pointer',
            borderRadius: 12,
            textAlign: 'left',
          }}
        >
          <XCircle size={16} />
          Отменить голос
        </button>
      </div>
    </>,
    document.body,
  );
}

export function ChannelPoll({
  postId,
  poll,
  disabled = false,
  onVote,
  onClearVote,
}: ChannelPollProps): JSX.Element {
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const suppressClickRef = useRef(false);
  const hasVoted = poll.myOptionId !== null;
  const longPress = useLongPress(
    (rect) => {
      if (!hasVoted) return;
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 350);
      setMenuRect(rect);
    },
    { delayMs: 500 },
  );

  return (
    <>
      <div
        {...longPress}
        onContextMenu={(event) => {
          if (!hasVoted) return;
          event.preventDefault();
          setMenuRect(event.currentTarget.getBoundingClientRect());
        }}
        style={{
          marginTop: 12,
          display: 'grid',
          gap: 8,
          touchAction: 'manipulation',
        }}
      >
        {poll.options.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            aria-label={`Вариант: ${option.text}`}
            onClick={() => {
              if (suppressClickRef.current || option.selectedByMe) return;
              onVote(postId, option.id);
            }}
            style={{
              position: 'relative',
              overflow: 'hidden',
              width: '100%',
              minHeight: 42,
              border: option.selectedByMe
                ? '1px solid rgba(15, 23, 42, 0.26)'
                : '1px solid rgba(255, 255, 255, 0.72)',
              borderRadius: 14,
              background: option.selectedByMe ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.54)',
              color: 'var(--ink)',
              padding: '10px 12px',
              display: 'grid',
              gridTemplateColumns: hasVoted ? 'minmax(0, 1fr) auto' : 'minmax(0, 1fr)',
              gap: 10,
              alignItems: 'center',
              textAlign: 'left',
              font: 'inherit',
              fontSize: 14,
              fontWeight: option.selectedByMe ? 950 : 820,
              cursor: disabled ? 'default' : 'pointer',
            }}
          >
            {hasVoted && (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: `${option.percent}%`,
                  background: option.selectedByMe
                    ? 'rgba(32, 154, 213, 0.24)'
                    : 'rgba(32, 154, 213, 0.13)',
                  transition: 'width 160ms ease',
                }}
              />
            )}
            <span style={{ position: 'relative', minWidth: 0, wordBreak: 'break-word' }}>
              {option.text}
            </span>
            {hasVoted && (
              <span style={{ position: 'relative', color: 'var(--muted)', fontWeight: 950 }}>
                {option.percent}%
              </span>
            )}
          </button>
        ))}
        {hasVoted && (
          <div
            style={{
              color: 'var(--muted)',
              fontSize: 11,
              fontWeight: 800,
              textAlign: 'right',
            }}
          >
            {formatVotes(poll.totalVotes)}
          </div>
        )}
      </div>
      <PollVoteActionsMenu
        anchorRect={menuRect}
        onClearVote={() => onClearVote(postId)}
        onClose={() => setMenuRect(null)}
      />
    </>
  );
}
