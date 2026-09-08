import { useEffect } from 'react';
import { useAmateurAccessToastStore } from './amateurAccessStore.js';

export const AMATEUR_ACCESS_TOAST_DURATION_MS = 2_800;

export function AmateurAccessToast(): JSX.Element | null {
  const toast = useAmateurAccessToastStore((state) => state.toast);
  const dismiss = useAmateurAccessToastStore((state) => state.dismiss);

  useEffect(() => {
    if (toast === null) return undefined;
    const timeoutId = window.setTimeout(
      () => dismiss(toast.sequence),
      AMATEUR_ACCESS_TOAST_DURATION_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [dismiss, toast]);

  if (toast === null) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'fixed',
        zIndex: 920,
        right: 16,
        bottom: 'calc(92px + var(--app-safe-bottom))',
        left: 16,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        className="glass-dark"
        style={{
          width: 'min(100%, 360px)',
          padding: '12px 15px',
          borderRadius: 18,
          boxShadow: '0 16px 38px rgba(2, 8, 23, 0.3)',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 950, lineHeight: 1.2 }}>
          Нужен статус «Любитель»
        </div>
        <div
          style={{
            marginTop: 4,
            color: 'rgba(255, 255, 255, 0.82)',
            fontSize: 12,
            fontWeight: 760,
            lineHeight: 1.35,
          }}
        >
          До открытия осталось забить {toast.goalsRemaining} шайб в ежедневной игре.
        </div>
      </div>
    </div>
  );
}
