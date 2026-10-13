import { useEffect, useRef, useState, type HTMLAttributes } from 'react';
import './HorizontalFilterRow.css';

/** Native touch scrolling, with mouse dragging and visible desktop controls. */
export function HorizontalFilterRow({ children, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  const rowRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; left: number; dragged: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [edges, setEdges] = useState({ left: false, right: false });
  const measure = (): void => {
    const row = rowRef.current;
    if (row) {
      const next = { left: row.scrollLeft > 1, right: row.scrollWidth - row.clientWidth - row.scrollLeft > 1 };
      setEdges(previous => previous.left === next.left && previous.right === next.right ? previous : next);
    }
  };

  useEffect(() => {
    const row = rowRef.current!;
    const move = (event: PointerEvent): void => {
      const active = gesture.current;
      if (!active || event.pointerId !== active.id) return;
      const dx = event.clientX - active.x;
      if (!active.dragged) {
        if (Math.abs(event.clientY - active.y) > Math.abs(dx) + 6) { gesture.current = null; return; }
        if (Math.abs(dx) < 6) return;
        active.dragged = true;
        suppressClick.current = true;
        row.classList.add('horizontal-filter-row--dragging');
        row.setPointerCapture?.(event.pointerId);
      }
      event.preventDefault();
      row.scrollLeft = Math.max(0, Math.min(row.scrollWidth - row.clientWidth, active.left - dx));
      measure();
    };
    const finish = (event: PointerEvent): void => {
      if (gesture.current?.id !== event.pointerId) return;
      gesture.current = null;
      row.classList.remove('horizontal-filter-row--dragging');
      if (row.hasPointerCapture?.(event.pointerId)) row.releasePointerCapture(event.pointerId);
      if (event.type === 'pointercancel') suppressClick.current = false;
      measure();
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(row);
    for (const child of row.children) observer?.observe(child);
    window.addEventListener('resize', measure);
    document.addEventListener('pointermove', move, { passive: false });
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', finish);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', finish);
    };
  }, []);
  useEffect(measure, [children]);

  const scroll = (direction: number): void => {
    const row = rowRef.current!;
    row.scrollLeft = Math.max(0, Math.min(row.scrollWidth - row.clientWidth, row.scrollLeft + direction * row.clientWidth * .75));
    measure();
  };
  const label = props['aria-label'] ?? 'Фильтры';
  return (
    <div className={`horizontal-filters${edges.left || edges.right ? ' horizontal-filters--overflow' : ''}`}>
      <div {...props} ref={rowRef} className={`horizontal-filters__row ${props.className ?? ''}`}
        onScroll={(event) => { measure(); props.onScroll?.(event); }}
        onPointerDown={(event) => {
          suppressClick.current = false;
          const row = rowRef.current!;
          if (event.pointerType === 'mouse' && event.button === 0 && row.scrollWidth > row.clientWidth + 1) {
            gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: row.scrollLeft, dragged: false };
          }
          props.onPointerDown?.(event);
        }}
        onClickCapture={(event) => {
          if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; event.preventDefault(); event.stopPropagation(); return; }
          props.onClickCapture?.(event);
        }}>
        {children}
      </div>
      {edges.left && <button type="button" className="horizontal-filters__arrow horizontal-filters__arrow--left" aria-label={`${label}: прокрутить влево`} onClick={() => scroll(-1)}>‹</button>}
      {edges.right && <button type="button" className="horizontal-filters__arrow horizontal-filters__arrow--right" aria-label={`${label}: прокрутить вправо`} onClick={() => scroll(1)}>›</button>}
    </div>
  );
}
