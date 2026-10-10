import { useLayoutEffect, useRef } from 'react';
export function FittedMenuLabel({ children }: { children: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const text = ref.current;
    if (!text) return;
    const resize = () => {
      text.style.fontSize = '';
      const size = parseFloat(getComputedStyle(text).fontSize);
      if (text.clientWidth > 0 && text.scrollWidth > text.clientWidth)
        text.style.fontSize = `${(size * Math.max(0, text.clientWidth - 1)) / text.scrollWidth}px`;
    };
    resize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(text);
    window.addEventListener('resize', resize);
    let disposed = false;
    void document.fonts?.ready.then(() => {
      if (!disposed) resize();
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [children]);
  return (
    <span ref={ref} className="game-scoreboard__label durak-menu__label">
      {children}
    </span>
  );
}
