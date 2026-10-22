import { useEffect, useState } from 'react';
/** Refresh date-sensitive labels while open and immediately after returning. */
export function useCityClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const update = () => {
      if (!document.hidden) setNow(new Date());
    };
    const timer = window.setInterval(update, 60000);
    window.addEventListener('focus', update);
    window.addEventListener('pageshow', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
      window.removeEventListener('pageshow', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return now;
}
