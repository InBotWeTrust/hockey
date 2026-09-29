import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface AppToastProps {
  message: string;
  onDismiss: () => void;
  variant?: 'default' | 'reward';
  durationMs?: number;
}

export function AppToast({
  message,
  onDismiss,
  variant = 'default',
  durationMs = 4_500,
}: AppToastProps): JSX.Element {
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const timer = window.setTimeout(() => onDismissRef.current(), durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, message]);

  const sentenceBreak = message.indexOf('. ');
  const title = sentenceBreak >= 0 ? message.slice(0, sentenceBreak + 1) : null;
  const body = sentenceBreak >= 0 ? message.slice(sentenceBreak + 2) : message;

  if (variant === 'reward') return createPortal(
    <div className="achievement-reward-toast" role="status" aria-live="polite">
      <span className="achievement-reward-toast__status">Дуэль недоступна</span>
      <strong className="achievement-reward-toast__title">{message}</strong>
    </div>,
    document.body,
  );

  return createPortal(
    <div className="duel-challenge-toast" role="status" aria-live="polite">
      {title !== null && <strong className="duel-challenge-toast__title">{title}</strong>}
      {title !== null && ' '}
      <span className="duel-challenge-toast__copy">{body}</span>
    </div>,
    document.body,
  );
}
