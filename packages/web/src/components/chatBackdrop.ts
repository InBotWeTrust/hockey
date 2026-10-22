import type {CSSProperties} from 'react';
// A neutral scrim must never inherit the white inset material in light mode.
export const chatBackdropStyle:CSSProperties={
 height:'var(--app-viewport-height, 100dvh)',
 bottom:'auto',
 background:'rgba(0, 0, 0, 0.12)',
 backdropFilter:'none',
 WebkitBackdropFilter:'none',
};
