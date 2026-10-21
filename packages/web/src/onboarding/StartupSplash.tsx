import {useLayoutEffect} from 'react';
import {createPortal} from 'react-dom';
import './onboarding.css';

const loadingRoots = new WeakMap<HTMLElement, {count:number; inert:string|null; hidden:string|null}>();

export function StartupSplash({
  message = 'Идёт загрузка…',
  retry,
}: {
  message?: string;
  retry?: () => void;
}): JSX.Element {
  useLayoutEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;
    const lock = loadingRoots.get(root) ?? {count:0, inert:root.getAttribute('inert'), hidden:root.getAttribute('aria-hidden')};
    lock.count++;
    loadingRoots.set(root, lock);
    root.setAttribute('inert', '');
    root.setAttribute('aria-hidden', 'true');
    return () => {
      if (--lock.count > 0) return;
      for (const [name, value] of [['inert', lock.inert], ['aria-hidden', lock.hidden]] as const) {
        if (value === null) root.removeAttribute(name);
        else root.setAttribute(name, value);
      }
      loadingRoots.delete(root);
    };
  }, []);
  const messageLines = message.split('. ').map((line, index, lines) =>
    index < lines.length - 1 ? `${line}.` : line);
  return createPortal(
    <main className="onboarding-flow onboarding-flow--startup" aria-label="Загрузка приложения">
      <div className="onboarding-flow__startup" role={retry ? 'alert' : 'status'}>
        <p>
          {messageLines.map((line) => (
            <span className="onboarding-flow__startup-message-line" key={line}>{line}</span>
          ))}
        </p>
        {retry && (
          <button className="btn btn--cta" type="button" onClick={retry}>
            Повторить
          </button>
        )}
      </div>
    </main>,
    document.body,
  );
}
