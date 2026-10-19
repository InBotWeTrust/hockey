import { useLayoutEffect, useRef, type ReactNode } from 'react';
import {
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'motion/react';
import './section-panorama.css';
import { LogOut } from 'lucide-react';

export interface PanoramaPage {
  id: string;
  label: string;
  image: string;
  position?: number;
  attention?: boolean | number;
}
export function adjacentSection(
  pages: readonly PanoramaPage[],
  selected: string,
  direction: -1 | 1,
): string {
  const index = Math.max(
    0,
    pages.findIndex((page) => page.id === selected),
  );
  return pages[Math.max(0, Math.min(pages.length - 1, index + direction))]?.id ?? selected;
}

/** One controlled page at a time; server data and purchase/game state stay in the parent. */
export function SectionPanorama({
  label,
  pages,
  selected,
  onSelect,
  panorama,
  storageKey,
  children,
  overlays,
  disabled = false,
  className = '',
  columns = pages.length,
}: {
  label: string;
  pages: readonly PanoramaPage[];
  selected: string;
  onSelect: (id: string) => void;
  panorama: string;
  storageKey: string;
  children: ReactNode;
  overlays?: ReactNode;
  disabled?: boolean;
  className?: string;
  columns?: number;
}): JSX.Element {
  const panel = useRef<HTMLElement>(null);
  const scroll = useRef<HTMLDivElement>(null),
    dock = useRef<HTMLDivElement>(null);
  const positions = useRef<Record<string, number>>({});
  const pendingRestore = useRef<number | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion(),
    controls = useDragControls(),
    dragX = useMotionValue(0);
  const index = Math.max(
    0,
    pages.findIndex((page) => page.id === selected),
  );
  const previousIndex = useRef(index),
    blockClickUntil = useRef(0);
  const scenePosition = pages[index]?.position ?? index;
  const target = useMotionValue(scenePosition),
    position = useSpring(target, { stiffness: 220, damping: 32 });
  const backgroundX = useTransform(
    [position, dragX],
    ([value, drag]) => `calc(${(-Number(value) * 100) / columns}% + ${Number(drag) * 0.35}px)`,
  );
  useLayoutEffect(() => {
    const measure = () => {
      const height = panel.current?.getBoundingClientRect().height;
      if (height) scroll.current?.style.setProperty('--section-panel-height', `${height}px`);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (panel.current) observer?.observe(panel.current);
    return () => observer?.disconnect();
  }, []);
  useLayoutEffect(() => {
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? '{}');
      positions.current =
        saved !== null && typeof saved === 'object' && !Array.isArray(saved)
          ? Object.fromEntries(
              Object.entries(saved).filter(
                ([, value]) => typeof value === 'number' && Number.isFinite(value) && value >= 0,
              ),
            )
          : {};
    } catch {
      positions.current = {};
    }
  }, [storageKey]);
  useLayoutEffect(() => {
    pendingRestore.current = positions.current[selected] ?? 0;
    if (scroll.current) scroll.current.scrollTop = pendingRestore.current;
    if (reduced) position.jump(scenePosition);
    else target.set(scenePosition);
    dock.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({
      block: 'nearest',
      inline: 'nearest',
      behavior: reduced ? 'instant' : 'smooth',
    });
    if (previousIndex.current !== index && !reduced) {
      dragX.set(
        (index > previousIndex.current ? 1 : -1) *
          Math.min(80, (scroll.current?.clientWidth ?? 360) * 0.22),
      );
      void animate(dragX, 0, { type: 'spring', stiffness: 330, damping: 34 });
    } else dragX.set(0);
    previousIndex.current = index;
  }, [storageKey, selected, index, scenePosition, reduced, position, target, dragX]);
  useLayoutEffect(() => {
    const restore = () => {
      const node = scroll.current,
        desired = pendingRestore.current;
      if (!node || desired === null) return;
      node.scrollTop = desired;
      if (node.scrollHeight - node.clientHeight >= desired) pendingRestore.current = null;
    };
    restore();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(restore);
    if (content.current) observer?.observe(content.current);
    return () => observer?.disconnect();
  }, [children, selected, storageKey]);
  const saveScroll = () => {
    if (!scroll.current || pendingRestore.current !== null) return;
    positions.current[selected] = scroll.current.scrollTop;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(positions.current));
    } catch {
      /* Optional UI persistence. */
    }
  };
  return (
    <main className={`screen section-scene ${className}`} aria-label={label}>
      <motion.div
        className="section-scene__panorama"
        aria-hidden="true"
        style={{ width: `${columns * 100}%`, x: backgroundX }}
      >
        <img src={panorama} alt="" draggable={false} decoding="async" />
      </motion.div>
      <div className="section-scene__shade" aria-hidden="true" />
      <motion.div
        className="section-scene__page"
        style={{ x: dragX }}
        drag="x"
        dragControls={controls}
        dragListener={false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={1}
        dragMomentum={false}
        onPointerDown={(event) => {
          if (disabled || event.button !== 0 || !event.isPrimary) return;
          if (
            (event.target as HTMLElement).closest(
              'input,select,textarea,[role="dialog"],[role="tablist"]',
            )
          )
            return;
          controls.start(event);
        }}
        onClickCapture={(event) => {
          if (event.detail !== 0 && performance.now() < blockClickUntil.current) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onDragStart={() => {
          blockClickUntil.current = performance.now() + 500;
        }}
        onPointerCancel={() => {
          blockClickUntil.current = performance.now() + 250;
          void animate(dragX, 0, { duration: 0 });
        }}
        onDragEnd={(_, info) => {
          blockClickUntil.current = performance.now() + 250;
          if (!disabled && (Math.abs(info.offset.x) > 48 || Math.abs(info.velocity.x) > 450)) {
            const next = adjacentSection(pages, selected, info.offset.x < 0 ? 1 : -1);
            if (next !== selected) {
              saveScroll();
              onSelect(next);
            }
          }
          void animate(
            dragX,
            0,
            reduced ? { duration: 0 } : { type: 'spring', stiffness: 330, damping: 34 },
          );
        }}
      >
        <div
          ref={scroll}
          className="section-scene__scroll"
          data-testid="section-page-scroll"
          onScroll={saveScroll}
          onWheel={() => {
            pendingRestore.current = null;
          }}
          onTouchStart={() => {
            pendingRestore.current = null;
          }}
          onKeyDown={() => {
            pendingRestore.current = null;
          }}
        >
          <div ref={content}>{children}</div>
        </div>
      </motion.div>
      <section ref={panel} className="section-scene__panel" aria-label={`Навигация: ${label}`}>
        <div className="section-scene__identity">
          <strong>{pages[index]?.label}</strong>
          <span>
            {index + 1} / {pages.length}
          </span>
        </div>
        <div className="section-scene__navigation">
          <a
            className="section-scene__exit"
            href="/sections?home=1"
            aria-label="На карту"
            title="На карту"
          >
            <span>
              <LogOut size={22} aria-hidden="true" />
            </span>
            <small>Выход</small>
          </a>
          <div
            ref={dock}
            className="section-scene__dock"
            role="tablist"
            aria-label={label === 'Бонусные игры' ? 'Навык' : `Разделы: ${label}`}
          >
            {pages.map((page, i) => (
              <button
                key={page.id}
                type="button"
                role="tab"
                aria-label={page.label}
                aria-selected={selected === page.id}
                title={page.label}
                onClick={() => {
                  saveScroll();
                  onSelect(page.id);
                }}
                onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  const next =
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? pages.length - 1
                        : Math.max(
                            0,
                            Math.min(pages.length - 1, i + (event.key === 'ArrowRight' ? 1 : -1)),
                          );
                  saveScroll();
                  onSelect(pages[next]!.id);
                  (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus();
                }}
              >
                <img src={page.image} alt="" draggable={false} />
                <span>{page.label}</span>
                {Number(page.attention) > 0 && (
                  <span className="section-scene__attention" aria-label="Есть награда">
                    {Number(page.attention) > 99 ? '99+' : Number(page.attention)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>
      {overlays}
    </main>
  );
}
