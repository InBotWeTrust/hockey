import { useLayoutEffect, useRef, type HTMLAttributes } from 'react';

export function FittedNotice({ fit, children, className, ...props }:
  HTMLAttributes<HTMLDivElement> & { fit: boolean }) {
  const textRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const text = textRef.current;
    if (!fit || !text) return;
    const resize = (): void => {
      text.style.fontSize = '12px';
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
  }, [fit, children]);
  return <div {...props} role="status" className={`${className ?? ''}${fit ? ' fitted-scoreboard-notice' : ''}`}>
    {fit ? <span ref={textRef}>{children}</span> : children}
  </div>;
}
