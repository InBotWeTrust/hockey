import { useLayoutEffect, useRef, type HTMLAttributes } from 'react';

type Props = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  children: string;
  maxFontSize?: number;
};

export function FittedHudLabel({ children, maxFontSize = 9.5, ...props }: Props): JSX.Element {
  const boxRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const box = boxRef.current;
    const text = textRef.current;
    if (!box || !text) return;
    let disposed = false;
    const fit = () => {
      if (disposed) return;
      text.style.fontSize = `${maxFontSize}px`;
      const style = getComputedStyle(box);
      const available = box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const natural = text.getBoundingClientRect().width;
      if (available > 0 && natural > available) {
        // Font metrics are not perfectly proportional at small sizes.
        let low = 0;
        let high = maxFontSize;
        for (let step = 0; step < 8; step += 1) {
          const size = (low + high) / 2;
          text.style.fontSize = `${size}px`;
          if (text.getBoundingClientRect().width > available) high = size;
          else low = size;
        }
        text.style.fontSize = `${low}px`;
      }
    };
    fit();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    observer?.observe(box);
    window.addEventListener('resize', fit);
    void document.fonts?.ready.then(fit);
    return () => { disposed = true; observer?.disconnect(); window.removeEventListener('resize', fit); };
  }, [children, maxFontSize]);
  return <span {...props} ref={boxRef}>
    <span ref={textRef} style={{ display: 'inline-block', flexShrink: 0, whiteSpace: 'nowrap' }}>{children}</span>
  </span>;
}
