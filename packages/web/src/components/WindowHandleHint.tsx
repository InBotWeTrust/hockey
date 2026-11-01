import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {createPortal} from 'react-dom';
import { X } from 'lucide-react';
import './window-handle-hint.css';

const memorySeen = new Set<string>();
const copy = {
  shortcuts: { title: 'Игры и сообщения\nвсегда под рукой', text: 'Нажми на значок, чтобы открыть окно.\nЗначки можно перетаскивать –\nих положение сохранится.' },
  games: { title: 'Окно игр можно двигать', text: 'Потяни за полоску сверху, чтобы\nпереместить окно.\nПоложение сохранится.' },
  messages: { title: 'Размер сообщений\nможно менять', text: 'Потяни полоску вверх или вниз,\nчтобы изменить высоту окна.\nРазмер сохранится.' },
};
function hasSeen(key: string): boolean {
  try { return localStorage.getItem(key) === '1'; }
  catch { return memorySeen.has(key); }
}
function HandleHint({ storageKey, kind, anchorRef }: { storageKey: string; kind: keyof typeof copy; anchorRef?: RefObject<HTMLElement | null> | undefined }): JSX.Element | null {
  const [visible, setVisible] = useState(() => !hasSeen(storageKey));
  const hintRef = useRef<HTMLElement>(null);
  const [position, setPosition] = useState({left: 12, top: 12, arrow: ''});
  useLayoutEffect(() => {
    if (!visible || !anchorRef?.current) return;
    const card = kind === 'shortcuts' ? anchorRef.current.closest('.app-shell') : anchorRef.current.closest('[role="dialog"]');
    if (!card) return;
    const update = () => {
      const rect = card.getBoundingClientRect();
      if (kind === 'shortcuts') {
        const targets = [...card.querySelectorAll('.floating-games.floating-shortcut, .floating-chat.floating-shortcut')].map(el => el.getBoundingClientRect());
        const width = hintRef.current?.getBoundingClientRect().width ?? 260;
        const games = card.querySelector('.floating-games.floating-shortcut')?.getBoundingClientRect();
        const height = hintRef.current?.getBoundingClientRect().height ?? 100;
        const left = Math.max(rect.left + 12, Math.min((games?.right ?? rect.left) + 80, rect.right - width - 12));
        const top = Math.max(rect.top + 12, Math.min(rect.bottom - height - 12, (games?.top ?? rect.top + 80) + 92));
        // Point beside the pair, outside the gap between the two shortcuts.
        const ex = Math.max(...targets.map(r => r.right)) + 24;
        const ey = (games?.top ?? rect.top + 80) + (games?.height ?? 44) + 8;
        const sx = left + 16, sy = top - 8;
        const angle = Math.atan2(ey-sy, ex-sx), head = 7, spread = Math.PI/6;
        const arrow = `M ${sx} ${sy} L ${ex} ${ey} M ${ex-head*Math.cos(angle-spread)} ${ey-head*Math.sin(angle-spread)} L ${ex} ${ey} L ${ex-head*Math.cos(angle+spread)} ${ey-head*Math.sin(angle+spread)}`;
        setPosition({left,top,arrow});
        return;
      }
      const hint = hintRef.current?.getBoundingClientRect();
      const width = hint?.width ?? 280, height = hint?.height ?? 100;
      const left = Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 12));
      const top = rect.top >= height + 48 ? rect.top - height - 36
        : rect.bottom + height + 24 <= window.innerHeight ? rect.bottom + 12 : 12;
      const handle = card.querySelector('.floating-games-window__handle span, .chat-overlay__grabber > span')?.getBoundingClientRect();
      const ex = handle ? handle.left - 8 : rect.left + rect.width / 2 - 26;
      const ey = handle ? handle.top - 8 : rect.top + 8;
      const above = top + height <= rect.top;
      const sx = left + width * .28, sy = above ? top + height + 6 : top - 6;
      const angle = Math.atan2(ey - sy, ex - sx);
      const head = 7, spread = Math.PI / 6;
      const ax = ex - head * Math.cos(angle - spread), ay = ey - head * Math.sin(angle - spread);
      const bx = ex - head * Math.cos(angle + spread), by = ey - head * Math.sin(angle + spread);
      const arrow = `M ${sx} ${sy} L ${ex} ${ey} M ${ax} ${ay} L ${ex} ${ey} L ${bx} ${by}`;
      setPosition(old => old.left === left && old.top === top && old.arrow === arrow ? old : {left, top, arrow});
    };
    update();
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    resize?.observe(card);
    if (hintRef.current) resize?.observe(hintRef.current);
    const move = new MutationObserver(update);
    move.observe(card, {attributes: true, attributeFilter: ['style']});
    window.addEventListener('resize', update);
    return () => {resize?.disconnect(); move.disconnect(); window.removeEventListener('resize', update);};
  }, [visible, anchorRef, kind]);
  useEffect(() => {
    if (!visible) return;
    memorySeen.add(storageKey);
    try { localStorage.setItem(storageKey, '1'); } catch { /* Remember in memory when storage is unavailable. */ }
  }, [storageKey, visible]);
  if (!visible) return null;
  const content = copy[kind];
  return <>{position.arrow&&<svg className="window-handle-hint__arrow" aria-hidden="true"><path d={position.arrow}/></svg>}<aside ref={hintRef} style={{left:position.left,top:position.top}} className="glass window-handle-hint" role="status" aria-live="polite" aria-label={kind === 'shortcuts' ? 'Подсказка: игры и сообщения' : kind === 'games' ? 'Подсказка: окно игр' : 'Подсказка: сообщения'}>
    <div className="window-handle-hint__header">
      <strong>{content.title}</strong>
      <button type="button" className="icon-btn" aria-label="Скрыть подсказку" onClick={() => setVisible(false)}><X size={14} aria-hidden="true" /></button>
    </div>
    <p>{content.text}</p>
  </aside></>;
}
export function WindowHandleHint({ owner, kind, anchorRef }: { owner?: string | undefined; kind: keyof typeof copy; anchorRef?: RefObject<HTMLElement | null> | undefined }): JSX.Element {
  const key = `window-handle-hint-v1:${owner ?? 'anonymous'}:${kind}`;
  return <HandleHint key={key} storageKey={key} kind={kind} anchorRef={anchorRef} />;
}

export function FloatingShortcutsHint({owner, visible}: {owner?: string | undefined; visible: boolean}): JSX.Element | null {
  const anchor = useRef<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    if (!visible) { setReady(false); return; }
    const update = () => {
      const games = document.querySelector<HTMLElement>('.floating-games.floating-shortcut');
      const chat = document.querySelector('.floating-chat.floating-shortcut');
      anchor.current = games;
      setReady(Boolean(games && chat));
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, {childList:true, subtree:true});
    return () => observer.disconnect();
  }, [visible]);
  return visible && ready ? createPortal(<div style={{position:"fixed",inset:0,zIndex:250,pointerEvents:"none"}}><WindowHandleHint owner={owner} kind="shortcuts" anchorRef={anchor}/></div>,document.body) : null;
}
