import '@testing-library/jest-dom/vitest';

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

// jsdom 24 omits PointerEvent. Provide a MouseEvent-derived shim so
// fireEvent.pointer* and React's SyntheticPointerEvent see pointerId / isPrimary.
if (typeof globalThis.PointerEvent === 'undefined') {
  interface PointerEventInitExt extends MouseEventInit {
    pointerId?: number;
    width?: number;
    height?: number;
    pressure?: number;
    tangentialPressure?: number;
    tiltX?: number;
    tiltY?: number;
    twist?: number;
    pointerType?: string;
    isPrimary?: boolean;
  }
  class PointerEventShim extends MouseEvent {
    pointerId: number;
    width: number;
    height: number;
    pressure: number;
    tangentialPressure: number;
    tiltX: number;
    tiltY: number;
    twist: number;
    pointerType: string;
    isPrimary: boolean;
    constructor(type: string, init: PointerEventInitExt = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.width = init.width ?? 1;
      this.height = init.height ?? 1;
      this.pressure = init.pressure ?? 0;
      this.tangentialPressure = init.tangentialPressure ?? 0;
      this.tiltX = init.tiltX ?? 0;
      this.tiltY = init.tiltY ?? 0;
      this.twist = init.twist ?? 0;
      this.pointerType = init.pointerType ?? '';
      this.isPrimary = init.isPrimary ?? false;
    }
  }
  // Cast through unknown — the shim covers the parts touched by tests.
  (globalThis as unknown as { PointerEvent: typeof PointerEvent }).PointerEvent =
    PointerEventShim as unknown as typeof PointerEvent;
  if (typeof window !== 'undefined') {
    (window as unknown as { PointerEvent: typeof PointerEvent }).PointerEvent =
      PointerEventShim as unknown as typeof PointerEvent;
  }
}

// Node 22+ ships a built-in `localStorage` that exposes `length` / indexers but
// not standard methods like `clear`, and jsdom defers to it once the global is
// already present. Install a minimal in-memory Storage shim so zustand persist
// and test utilities behave as browser code expects.
class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number {
    return this.data.size;
  }
  clear(): void {
    this.data.clear();
  }
  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
}

const installStorage = (name: 'localStorage' | 'sessionStorage'): void => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, name, {
    value: storage,
    configurable: true,
    writable: true,
  });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, name, {
      value: storage,
      configurable: true,
      writable: true,
    });
  }
};

installStorage('localStorage');
installStorage('sessionStorage');
