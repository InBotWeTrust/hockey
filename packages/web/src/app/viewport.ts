/** Keep one viewport contract for application chrome and routed screens. */
export function installAppViewport(): () => void {
  const visual = window.visualViewport;
  const root = document.documentElement;
  const update = (): void => {
    // Safari's resting visual viewport may exclude browser/safe-area chrome.
    // Use CSS dynamic viewport units there, rather than freezing a shorter px value.
    // Only substantial occlusion at normal scale represents the soft keyboard.
    const keyboardOpen = Boolean(visual && Math.abs(visual.scale - 1) < 0.01 &&
      visual.height > 0 && window.innerHeight - visual.height > 120);
    root.style.setProperty('--app-viewport-height', keyboardOpen ? `${visual!.height}px` : '100dvh');
    root.style.setProperty('--app-viewport-top', keyboardOpen ? `${Math.max(0, visual!.offsetTop)}px` : '0px');
    root.classList.toggle('app-keyboard-open', keyboardOpen);
  };
  update();
  const visualEvents = ['resize', 'scroll'] as const;
  const windowEvents = ['resize', 'orientationchange', 'pageshow'] as const;
  const documentEvents = ['visibilitychange', 'focusin', 'focusout'] as const;
  visualEvents.forEach((event) => visual?.addEventListener(event, update));
  windowEvents.forEach((event) => window.addEventListener(event, update));
  documentEvents.forEach((event) => document.addEventListener(event, update));
  return () => {
    visualEvents.forEach((event) => visual?.removeEventListener(event, update));
    windowEvents.forEach((event) => window.removeEventListener(event, update));
    documentEvents.forEach((event) => document.removeEventListener(event, update));
  };
}
