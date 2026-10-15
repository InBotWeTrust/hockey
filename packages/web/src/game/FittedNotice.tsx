import { useLayoutEffect, useRef, type HTMLAttributes } from 'react';

export function FittedNotice({ fit, maxLines = 1, children, className, role = 'status', ...props }:
  HTMLAttributes<HTMLDivElement> & { fit: boolean; maxLines?: number }) {
  const textRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const text = textRef.current;
    if (!fit || !text) return;
    const resize = (): void => {
      text.style.fontSize = '12px';
      if (maxLines > 1) {
        text.style.whiteSpace = 'normal';
        for (let size = 12; size >= 9; size -= 0.5) {
          text.style.fontSize = `${size}px`;
          if (text.scrollHeight <= size * 1.3 * maxLines + 1 && text.scrollWidth <= text.clientWidth) break;
        }
        return;
      }
      const available = text.clientWidth;
      const natural = text.scrollWidth;
      if (available > 0 && natural > available) {
        text.style.fontSize = `${12 * available / natural}px`;
      }
    };
    resize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(text.parentElement!);
    window.addEventListener('resize', resize);
    return () => { observer?.disconnect(); window.removeEventListener('resize', resize); };
  }, [fit, maxLines, children]);
  return <div {...props} role={role} className={`${className ?? ''}${fit ? ' fitted-scoreboard-notice' : ''}`}>
    {fit ? <span ref={textRef}>{children}</span> : children}
  </div>;
}
