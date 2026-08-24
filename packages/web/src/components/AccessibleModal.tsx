import {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE_SELECTOR = [
  'button:not(:disabled)',
  'input:not(:disabled):not([type="hidden"])',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

interface BackgroundSnapshot {
  element: HTMLElement;
  inert: string | null;
  ariaHidden: string | null;
}

function focusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

function restoreAttribute(element: HTMLElement, name: string, value: string | null): void {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

export function AccessibleModal({
  title,
  copy,
  onClose,
  closeBlocked = false,
  initialFocusRef,
  restoreFocusTo,
  cardClassName,
  cardStyle,
  backdropStyle,
  children,
}: {
  title: string;
  copy?: ReactNode;
  onClose: () => void;
  closeBlocked?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  restoreFocusTo?: HTMLElement | null;
  cardClassName?: string;
  cardStyle?: CSSProperties;
  backdropStyle?: CSSProperties;
  children: ReactNode;
}): JSX.Element {
  const titleId = useId();
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const closeBlockedRef = useRef(closeBlocked);
  const restoreTargetRef = useRef<HTMLElement | null>(
    restoreFocusTo === undefined
      ? document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
      : restoreFocusTo,
  );
  onCloseRef.current = onClose;
  closeBlockedRef.current = closeBlocked;

  useEffect(() => {
    const dialog = dialogRef.current;
    const backdrop = backdropRef.current;
    if (dialog === null || backdrop === null) return undefined;

    const portalBranch = Array.from(document.body.children).find(
      (element) => element === backdrop || element.contains(backdrop),
    );
    const backgrounds = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement)
      .filter((element) => element !== portalBranch)
      .map<BackgroundSnapshot>((element) => ({
        element,
        inert: element.getAttribute('inert'),
        ariaHidden: element.getAttribute('aria-hidden'),
      }));
    for (const background of backgrounds) {
      background.element.setAttribute('inert', '');
      background.element.setAttribute('aria-hidden', 'true');
    }

    const initialFocus = initialFocusRef?.current ?? focusableElements(dialog)[0] ?? dialog;
    initialFocus.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!closeBlockedRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = focusableElements(dialog);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && activeIndex <= 0) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeIndex === -1 || activeIndex >= focusable.length - 1)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      for (const background of backgrounds) {
        restoreAttribute(background.element, 'inert', background.inert);
        restoreAttribute(background.element, 'aria-hidden', background.ariaHidden);
      }
      const restoreTarget = restoreTargetRef.current;
      if (restoreTarget?.isConnected) restoreTarget.focus();
    };
  }, [initialFocusRef]);

  return createPortal(
    <div
      ref={backdropRef}
      className="modal-backdrop"
      role="presentation"
      style={backdropStyle}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !closeBlockedRef.current) onCloseRef.current();
      }}
    >
      <section
        ref={dialogRef}
        className={cardClassName ? `modal-card ${cardClassName}` : 'modal-card'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={cardStyle}
      >
        <h2 id={titleId} className="modal-title">
          {title}
        </h2>
        {copy !== undefined && <p className="modal-copy">{copy}</p>}
        <div style={{ marginTop: 14 }}>{children}</div>
      </section>
    </div>,
    document.body,
  );
}
