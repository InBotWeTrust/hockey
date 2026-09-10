import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface AppToastProps {
  message: string;
  onDismiss: () => void;
}

export function AppToast({ message, onDismiss }: AppToastProps): JSX.Element {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 4_500);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

  const sentenceBreak = message.indexOf('. ');
  const title = sentenceBreak >= 0 ? message.slice(0, sentenceBreak + 1) : null;
  const body = sentenceBreak >= 0 ? message.slice(sentenceBreak + 2) : message;

  return createPortal(
    <div className="duel-challenge-toast" role="status" aria-live="polite">
      {title !== null && <strong className="duel-challenge-toast__title">{title}</strong>}
      {title !== null && ' '}
      <span className="duel-challenge-toast__copy">{body}</span>
    </div>,
    document.body,
  );
}
