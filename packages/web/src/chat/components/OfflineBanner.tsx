import { useEffect, useState } from 'react';
import type { ChatSocketStatus } from '../ws.js';

const RECONNECT_SHOW_AFTER_MS = 10_000;

interface Props {
  status: ChatSocketStatus;
}

export function OfflineBanner({ status }: Props): JSX.Element | null {
  const [visible, setVisible] = useState(false);
  const [browserOffline, setBrowserOffline] = useState(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );

  useEffect(() => {
    const onOnline = () => setBrowserOffline(false);
    const onOffline = () => setBrowserOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (browserOffline) {
      setVisible(true);
      return;
    }
    if (status !== 'reconnecting') {
      setVisible(false);
      return;
    }
    const t = window.setTimeout(() => setVisible(true), RECONNECT_SHOW_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [browserOffline, status]);

  if (!visible) return null;

  const label = browserOffline
    ? 'Нет соединения — ждём сеть...'
    : 'Чат переподключается — пробуем снова...';

  return (
    <div
      role="status"
      aria-live="polite"
      className="glass-dark"
      style={{
        position: 'fixed',
        top: 'calc(var(--app-safe-top) + 6px)',
        left: 12,
        right: 12,
        margin: '0 auto',
        maxWidth: 406,
        padding: '6px 14px',
        textAlign: 'center',
        fontSize: 12,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.92)',
        zIndex: 700,
        borderRadius: '0 0 12px 12px',
      }}
    >
      {label}
    </div>
  );
}
