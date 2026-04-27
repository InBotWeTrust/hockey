import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export interface UseLongPressOptions {
  delayMs?: number;
  moveThreshold?: number;
}

export interface UseLongPressHandlers {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerLeave: (e: ReactPointerEvent<HTMLElement>) => void;
}

interface PressState {
  startX: number;
  startY: number;
  timer: ReturnType<typeof setTimeout> | null;
  pointerId: number;
}

export function useLongPress(
  callback: (rect: DOMRect) => void,
  opts: UseLongPressOptions = {},
): UseLongPressHandlers {
  const delayMs = opts.delayMs ?? 500;
  const moveThreshold = opts.moveThreshold ?? 5;
  const stateRef = useRef<PressState | null>(null);

  const cancel = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    if (s.timer) clearTimeout(s.timer);
    stateRef.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!e.isPrimary) return;
      const target = e.currentTarget;
      const timer = setTimeout(() => {
        if (stateRef.current?.timer === timer) {
          stateRef.current = null;
          const rect = target.getBoundingClientRect();
          callback(rect);
        }
      }, delayMs);
      stateRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        timer,
        pointerId: e.pointerId,
      };
    },
    [callback, delayMs],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const s = stateRef.current;
      if (!s || s.pointerId !== e.pointerId) return;
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      if (Math.hypot(dx, dy) > moveThreshold) cancel();
    },
    [cancel, moveThreshold],
  );

  const onPointerUp = cancel;
  const onPointerCancel = cancel;
  const onPointerLeave = cancel;

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onPointerLeave };
}
