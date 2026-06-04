import { describe, it, expect, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

const pixiMock = vi.hoisted(() => ({
  destroy: vi.fn(),
}));

vi.mock('pixi.js', () => {
  class FakeApp {
    canvas = document.createElement('canvas');
    stage = {
      addChild: (): void => {},
      removeChildren: (): void => {},
    };
    ticker = {
      add: (): void => {},
      remove: (): void => {},
    };
    async init(): Promise<void> {}
    destroy(): void {
      pixiMock.destroy();
    }
  }
  const Assets = { load: async (): Promise<void> => {} };
  return { Application: FakeApp, Assets };
});

import { PixiStage } from './PixiStage.js';

describe('PixiStage', () => {
  it('mounts without throwing and calls onReady', async () => {
    const onReady = vi.fn();
    render(<PixiStage onReady={onReady} onResize={() => {}} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(onReady).toHaveBeenCalled();
    cleanup();
  });

  it('inserts a canvas into the DOM', async () => {
    const { container } = render(<PixiStage onReady={() => {}} onResize={() => {}} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('does not recreate the pixi app when callback props change', async () => {
    const firstReady = vi.fn();
    const firstResize = vi.fn();
    const view = render(<PixiStage onReady={firstReady} onResize={firstResize} />);
    await new Promise((r) => setTimeout(r, 20));
    pixiMock.destroy.mockClear();

    view.rerender(<PixiStage onReady={vi.fn()} onResize={vi.fn()} />);
    await new Promise((r) => setTimeout(r, 20));

    expect(pixiMock.destroy).not.toHaveBeenCalled();
    expect(view.container.querySelectorAll('canvas')).toHaveLength(1);
  });
});
