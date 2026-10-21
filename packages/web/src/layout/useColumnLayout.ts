import { useLayoutEffect, useState, type RefObject } from 'react';
import { calculateColumnLayout } from './columnLayout.js';
export function useColumnLayout(
  ref: RefObject<HTMLElement>,
  pageCount: number,
  selectedIndex: number,
  dockedChat = false,
) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setWidth(node.getBoundingClientRect().width);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(node);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [ref]);
  return calculateColumnLayout({ width, pageCount, selectedIndex, dockedChat });
}
