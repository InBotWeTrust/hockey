import {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion, type MotionStyle } from 'motion/react';

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

const activeModalStack: symbol[] = [];

export type DismissReason = 'backdrop' | 'escape' | 'close-button' | 'drag';

function focusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

function restoreAttribute(element: HTMLElement, name: string, value: string | null): void {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

export function AccessibleModal({
  title,
  ariaLabel,
  copy,
  onClose,
  onRequestClose,
  open = true,
  presentation = 'modal',
  onDragEnd,
  closeBlocked = false,
  initialFocusRef,
  restoreFocusTo,
  cardClassName,
  cardStyle,
  backdropStyle,
  backdropTestId,
  headerAction,
  children,
}: {
  title: string;
  ariaLabel?: string;
  copy?: ReactNode;
  onClose?: () => void;
  onRequestClose?: (reason: DismissReason) => void;
  open?: boolean;
  presentation?: 'modal' | 'sheet';
  onDragEnd?: (offsetY: number, velocityY: number) => void;
  closeBlocked?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  restoreFocusTo?: HTMLElement | null;
  cardClassName?: string;
  cardStyle?: CSSProperties;
  backdropStyle?: CSSProperties;
  backdropTestId?: string;
  headerAction?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  const reduceMotion = useReducedMotion();
  const titleId = useId();
  const modalIdRef = useRef(Symbol('accessible-modal'));
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const onRequestCloseRef = useRef<(reason: DismissReason) => void>(() => undefined);
  const closeBlockedRef = useRef(closeBlocked);
  const restoreTargetRef = useRef<HTMLElement | null>(
    restoreFocusTo === undefined
      ? document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
      : restoreFocusTo,
  );
  onRequestCloseRef.current = onRequestClose ?? (() => onClose?.());
  closeBlockedRef.current = closeBlocked;

  useEffect(() => {
    if (!open) return undefined;
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

    const modalId = modalIdRef.current;
    activeModalStack.push(modalId);

    const initialFocus = initialFocusRef?.current ?? focusableElements(dialog)[0] ?? dialog;
    initialFocus.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (activeModalStack.at(-1) !== modalId) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!closeBlockedRef.current) onRequestCloseRef.current('escape');
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
      const stackIndex = activeModalStack.lastIndexOf(modalId);
      if (stackIndex !== -1) activeModalStack.splice(stackIndex, 1);
      for (const background of backgrounds) {
        restoreAttribute(background.element, 'inert', background.inert);
        restoreAttribute(background.element, 'aria-hidden', background.ariaHidden);
      }
      const restoreTarget = restoreTargetRef.current;
      if (restoreTarget?.isConnected) restoreTarget.focus();
    };
  }, [initialFocusRef, open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={backdropRef}
          data-testid={backdropTestId}
          className={
            presentation === 'sheet' ? 'modal-backdrop modal-backdrop--sheet' : 'modal-backdrop'
          }
          role="presentation"
          style={backdropStyle as MotionStyle}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.12 : 0.18 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !closeBlockedRef.current) {
              onRequestCloseRef.current('backdrop');
            }
          }}
        >
          <motion.section
            ref={dialogRef}
            className={cardClassName ? `modal-card ${cardClassName}` : 'modal-card'}
            role="dialog"
            aria-modal="true"
            {...(ariaLabel === undefined
              ? { 'aria-labelledby': titleId }
              : { 'aria-label': ariaLabel })}
            tabIndex={-1}
            style={cardStyle as MotionStyle}
            initial={
              reduceMotion
                ? { opacity: 0 }
                : presentation === 'sheet'
                  ? { opacity: 0.92, y: '100%' }
                  : { opacity: 0, y: 10, scale: 0.96 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              reduceMotion
                ? { opacity: 0 }
                : presentation === 'sheet'
                  ? { opacity: 0.92, y: '100%' }
                  : { opacity: 0, y: 10, scale: 0.96 }
            }
            transition={
              reduceMotion
                ? { type: 'tween', duration: 0.12 }
                : {
                    type: 'spring',
                    stiffness: presentation === 'sheet' ? 430 : 360,
                    damping: presentation === 'sheet' ? 36 : 34,
                    mass: 1,
                  }
            }
            drag={presentation === 'sheet' && !closeBlocked ? 'y' : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.06, bottom: 0.62 }}
            dragSnapToOrigin
            {...(onDragEnd === undefined
              ? {}
              : { onDragEnd: (_event, info) => onDragEnd(info.offset.y, info.velocity.y) })}
          >
            {headerAction === undefined ? (
              <h2 id={titleId} className="modal-title">
                {title}
              </h2>
            ) : (
              <div className="modal-header">
                <h2 id={titleId} className="modal-title">
                  {title}
                </h2>
                {headerAction}
              </div>
            )}
            {copy !== undefined && <p className="modal-copy">{copy}</p>}
            <div style={{ marginTop: 14 }}>{children}</div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
