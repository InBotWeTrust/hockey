import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { BarGameAction, barArmwrestling } from '@hockey/game-core';
type Input = barArmwrestling.ArmInput;
type Finger = { id: number; x: number; y: number; support: number };
export function useArmControls({
  seq,
  disabled,
  send,
}: {
  seq: number;
  disabled: boolean;
  send: (a: BarGameAction) => void;
}) {
  const [input, setInput] = useState<Input>({
    seq,
    supportHeld: false,
    support: 0.5,
    pressing: false,
    wrist: 'straight',
  });
  const value = useRef(input),
    nextSeq = useRef(seq),
    sendRef = useRef(send),
    blocked = useRef(disabled);
  sendRef.current = send;
  blocked.current = disabled;
  nextSeq.current = Math.max(seq, nextSeq.current);
  const fingers = useRef<{ support: Finger | null; pressure: Finger | null }>({
    support: null,
    pressure: null,
  });
  const lastSent = useRef(-Infinity),
    scheduled = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emit = () => {
    if (scheduled.current !== null) return;
    const deliver = () => {
      scheduled.current = null;
      lastSent.current = performance.now();
      sendRef.current({ type: 'arm-input', ...value.current, seq: ++nextSeq.current });
    };
    const wait = 100 - (performance.now() - lastSent.current);
    if (wait <= 0) deliver();
    else scheduled.current = setTimeout(deliver, wait);
  };
  const update = (patch: Partial<Input>) => {
    value.current = { ...value.current, ...patch };
    setInput(value.current);
    emit();
  };
  const releaseAll = () => {
    fingers.current = { support: null, pressure: null };
    if (value.current.supportHeld || value.current.pressing)
      update({ supportHeld: false, pressing: false });
  };
  useEffect(() => {
    const onHidden = () => {
      if (document.hidden) releaseAll();
    };
    const heartbeat = setInterval(() => {
      if (!blocked.current && (value.current.supportHeld || value.current.pressing)) emit();
    }, 250);
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      clearInterval(heartbeat);
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', onHidden);
      if (scheduled.current !== null) clearTimeout(scheduled.current);
      scheduled.current = null;
      if (value.current.supportHeld || value.current.pressing)
        sendRef.current({
          type: 'arm-input',
          ...value.current,
          seq: ++nextSeq.current,
          supportHeld: false,
          pressing: false,
        });
    };
  }, []);
  useEffect(() => {
    if (disabled) releaseAll();
  }, [disabled]);
  const handlers = (region: 'support' | 'pressure') => ({
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (
        blocked.current ||
        fingers.current[region] ||
        Object.values(fingers.current).some((f) => f?.id === e.pointerId)
      )
        return;
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      fingers.current[region] = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        support: value.current.support,
      };
      update(region === 'support' ? { supportHeld: true } : { pressing: true });
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const finger = fingers.current[region];
      if (!finger || finger.id !== e.pointerId) return;
      e.preventDefault();
      if (region === 'support')
        update({
          support: Math.max(0, Math.min(1, finger.support + (finger.y - e.clientY) / 150)),
        });
      else {
        const dx = e.clientX - finger.x;
        const wrist =
          dx > 36
            ? 'inside'
            : dx < -36
              ? 'outside'
              : Math.abs(dx) < 20
                ? 'straight'
                : value.current.wrist;
        update({ wrist });
      }
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      if (fingers.current[region]?.id !== e.pointerId) return;
      fingers.current[region] = null;
      update(region === 'support' ? { supportHeld: false } : { pressing: false });
    },
    onPointerCancel: (e: PointerEvent<HTMLElement>) => {
      if (fingers.current[region]?.id !== e.pointerId) return;
      fingers.current[region] = null;
      update(region === 'support' ? { supportHeld: false } : { pressing: false });
    },
    onLostPointerCapture: (e: PointerEvent<HTMLElement>) => {
      if (fingers.current[region]?.id !== e.pointerId) return;
      fingers.current[region] = null;
      update(region === 'support' ? { supportHeld: false } : { pressing: false });
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });
  return { input, supportHandlers: handlers('support'), pressureHandlers: handlers('pressure') };
}
