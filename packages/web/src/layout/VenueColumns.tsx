import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { PanoramaPage } from '../components/SectionPanorama.js';
import { useColumnLayout } from './useColumnLayout.js';
import './venue-columns.css';
export interface VenueColumnPage extends PanoramaPage {
  render: () => ReactNode;
}
export function VenueColumns({
  pages,
  selected,
  onSelect,
  storageKey,
  dockedChat = false,
}: {
  pages: readonly VenueColumnPage[];
  selected: string;
  onSelect: (id: string) => void;
  storageKey: string;
  dockedChat: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const index = Math.max(
    0,
    pages.findIndex((page) => page.id === selected),
  );
  const layout = useColumnLayout(root, pages.length, index, dockedChat);
  const [first, setFirst] = useState(layout.firstIndex);
  const start = Math.max(0, Math.min(first, index, Math.max(0, pages.length - layout.count)));
  const visibleStart = index >= start + layout.count ? index - layout.count + 1 : start;
  const visited = useRef(new Set<string>());
  for (const page of pages.slice(visibleStart, visibleStart + layout.count))
    visited.current.add(page.id);
  useLayoutEffect(() => setFirst(visibleStart), [visibleStart]);
  const style = {
    '--column-width': `${layout.columnWidth}px`,
    '--column-gap': `${layout.gap}px`,
    '--column-count': layout.count,
    '--columns-left': `${Math.max(layout.gutter, (layout.contentWidth - (layout.columnWidth * layout.count + layout.gap * (layout.count - 1))) / 2)}px`,
  } as CSSProperties;
  return (
    <div ref={root} className="venue-columns" style={style} data-visible-count={layout.count}>
      <div
        className="venue-columns__track"
        style={{ transform: `translateX(-${visibleStart * (layout.columnWidth + layout.gap)}px)` }}
      >
        {pages.map((page, i) => {
          const visible = i >= visibleStart && i < visibleStart + layout.count;
          return (
            <section
              key={page.id}
              className="venue-column"
              aria-label={page.label}
              aria-hidden={!visible}
              {...{ inert: visible ? undefined : '' }}
              style={{ visibility: visible ? 'visible' : 'hidden' }}
              onFocusCapture={() => {
                if (selected !== page.id) onSelect(page.id);
              }}
              onPointerDownCapture={() => {
                if (selected !== page.id) onSelect(page.id);
              }}
            >
              <ColumnScroll storageKey={storageKey} page={page.id}>
                {visited.current.has(page.id) && (visible || layout.contentWidth > 430) ? page.render() : null}
              </ColumnScroll>
            </section>
          );
        })}
      </div>
      {pages.length > layout.count && (
        <div className="venue-columns__arrows" data-no-section-swipe>
          <button
            className="icon-btn"
            aria-label="Предыдущие разделы"
            disabled={visibleStart === 0}
            onClick={() => onSelect(pages[Math.max(0, visibleStart - 1)]!.id)}
          >
            ‹
          </button>
          <button
            className="icon-btn"
            aria-label="Следующие разделы"
            disabled={visibleStart + layout.count >= pages.length}
            onClick={() =>
              onSelect(pages[Math.min(pages.length - 1, visibleStart + layout.count)]!.id)
            }
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
function ColumnScroll({
  storageKey,
  page,
  children,
}: {
  storageKey: string;
  page: string;
  children: ReactNode;
}) {
  const scroll = useRef<HTMLDivElement>(null),
    content = useRef<HTMLDivElement>(null);
  const key = storageKey;
  const desired = useRef<number | null>(null);
  useLayoutEffect(() => {
    try {
      const stored=JSON.parse(sessionStorage.getItem(key)??'{}');
      const value=Number(stored?.[page]??0);
      desired.current = Number.isFinite(value) ? Math.max(0, value) : 0;
    } catch {
      desired.current = 0;
    }
    const restore = () => {
      const node = scroll.current;
      if (!node || desired.current === null) return;
      node.scrollTop = desired.current;
      if (node.scrollHeight - node.clientHeight >= desired.current) desired.current = null;
    };
    restore();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(restore);
    if (content.current) observer?.observe(content.current);
    return () => observer?.disconnect();
  }, [key,page]);
  return (
    <div
      ref={scroll}
      className="venue-column__scroll"
      data-testid="venue-column-scroll"
      onWheel={() => {
        desired.current = null;
      }}
      onTouchStart={() => {
        desired.current = null;
      }}
      onKeyDown={() => {
        desired.current = null;
      }}
      onScroll={() => {
        if (desired.current !== null) return;
        try {
          const stored=JSON.parse(sessionStorage.getItem(key)??'{}');
          const previous=stored&&typeof stored==='object'&&!Array.isArray(stored)?stored:{};
          sessionStorage.setItem(key,JSON.stringify({...previous,[page]:scroll.current?.scrollTop??0}));
        } catch {
          /* Optional scroll persistence. */
        }
      }}
    >
      <div ref={content}>{children}</div>
    </div>
  );
}
