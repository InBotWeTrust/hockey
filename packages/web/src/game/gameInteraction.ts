import type { SyntheticEvent } from 'react';

function preventBrowserInteraction(event: SyntheticEvent): void {
  const target = event.target;
  if (target instanceof Element && target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])')) return;
  event.preventDefault();
}

export const gameInteractionProps = {
  'data-game-interaction': '',
  onContextMenuCapture: preventBrowserInteraction,
  onDragStartCapture: preventBrowserInteraction,
};
