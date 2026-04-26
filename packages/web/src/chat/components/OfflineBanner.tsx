import { useEffect, useState } from 'react';
import type { ChatSocketStatus } from '../ws.js';

const SHOW_AFTER_MS = 3_000;

interface Props {
  status: ChatSocketStatus;
}

export function OfflineBanner({ status }: Props): JSX.Element | null {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (status === 'open' || status === 'closed') {
      setVisible(false);
      return;
    }
    const t = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [status]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="glass-dark"
      style={{
        position: 'fixed',
        top: 'env(safe-area-inset-top, 0px)',
        left: 0,
        right: 0,
        margin: '0 auto',
        maxWidth: 430,
        padding: '6px 14px',
        textAlign: 'center',
        fontSize: 12,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.92)',
        zIndex: 700,
        borderRadius: '0 0 12px 12px',
      }}
    >
      Соединение пропало — пробуем снова...
    </div>
  );
}
