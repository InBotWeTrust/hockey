import { create } from 'zustand';
import type { ColumnLocation } from '../../layout/columnNavigationStore.js';
import type { ChatRect } from './chatWindowGeometry.js';
export type ChatWindowMode = 'closed' | 'minimized' | 'floating' | 'docked';
interface WindowState {
  owner: string | null;
  mode: ChatWindowMode;
  rect: ChatRect;
  opened: boolean;
  location: ColumnLocation;
  setOwner: (owner: string | null) => void;
  open: () => void;
  setMode: (mode: ChatWindowMode) => void;
  setRect: (rect: ChatRect) => void;
  setLocation: (location: ColumnLocation) => void;
}
const initialRect: ChatRect = { x: 24, y: 72, width: 360, height: 600 };
const storageKey = (owner: string) => `chat-window-v1:${owner}`;
function save(state: WindowState) {
  if (!state.owner) return;
  try {
    localStorage.setItem(
      storageKey(state.owner),
      JSON.stringify({ mode: state.mode, rect: state.rect }),
    );
  } catch {
    /* Geometry persistence is optional. */
  }
}
export const useChatWindowStore = create<WindowState>((set, get) => ({
  owner: null,
  mode: 'closed',
  opened: false,
  rect: initialRect,
  location: { pathname: '/chat', search: '', hash: '' },
  setOwner: (owner) => {
    if (get().owner === owner) return;
    let mode: ChatWindowMode = 'closed',
      rect = initialRect;
    if (owner)
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey(owner)) ?? 'null');
        if (
          stored &&
          ['closed', 'minimized', 'floating', 'docked'].includes(stored.mode) &&
          ['x', 'y', 'width', 'height'].every(
            (k) => typeof stored.rect?.[k] === 'number' && Number.isFinite(stored.rect[k]),
          )
        ) {
          mode = stored.mode;
          rect = stored.rect;
        }
      } catch {
        /* Ignore corrupt optional storage. */
      }
    set({
      owner,
      mode,
      rect,
      opened: mode !== 'closed',
      location: { pathname: '/chat', search: '', hash: '' },
    });
  },
  open: () => {
    set((state) => ({ opened: true, mode: state.mode === 'docked' ? 'docked' : 'floating' }));
    save(get());
  },
  setMode: (mode) => {
    set({ mode });
    save(get());
  },
  setRect: (rect) => {
    set({ rect });
    save(get());
  },
  setLocation: (location) => set({ location }),
}));
