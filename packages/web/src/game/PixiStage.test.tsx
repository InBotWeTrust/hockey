import { describe, it, expect, vi } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';

const pixiMock = vi.hoisted(() => ({
  destroy: vi.fn(),
  load: vi.fn(async (_assets: string | readonly string[]): Promise<void> => undefined),
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
  const Assets = { load: pixiMock.load };
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

  it('preloads only the supplied current bonus arena and goalkeeper media', async () => {
    pixiMock.load.mockClear();
    const currentAssets = [
      '/bonus-games/arenas/beach.webp',
      '/bonus-games/goalkeepers/beach-ready.webp',
      '/bonus-games/goalkeepers/beach-save.webp',
    ];
    render(<PixiStage onReady={() => {}} onResize={() => {}} preloadAssets={currentAssets} />);

    await waitFor(() => {
      const loaded = pixiMock.load.mock.calls.flatMap(([assets]) =>
        Array.isArray(assets) ? assets : [assets],
      );
      expect(loaded).toEqual(expect.arrayContaining(currentAssets));
      expect(loaded).not.toContain('/bonus-games/arenas/castle.webp');
    });
  });

  it('does not reload the same supplied media when the array identity changes', async () => {
    pixiMock.load.mockClear();
    const currentAssets = [
      '/bonus-games/arenas/beach.webp',
      '/bonus-games/goalkeepers/beach-ready.webp',
      '/bonus-games/goalkeepers/beach-save.webp',
    ];
    const view = render(
      <PixiStage onReady={() => {}} onResize={() => {}} preloadAssets={currentAssets} />,
    );
    await waitFor(() => expect(pixiMock.load).toHaveBeenCalledTimes(1));

    view.rerender(
      <PixiStage onReady={() => {}} onResize={() => {}} preloadAssets={[...currentAssets]} />,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(pixiMock.load).toHaveBeenCalledTimes(1);
  });

  it('loads a changed media set without recreating the pixi app', async () => {
    pixiMock.load.mockClear();
    pixiMock.destroy.mockClear();
    const view = render(
      <PixiStage
        onReady={() => {}}
        onResize={() => {}}
        preloadAssets={['/bonus-games/arenas/beach.webp']}
      />,
    );
    await waitFor(() => expect(pixiMock.load).toHaveBeenCalledTimes(1));

    view.rerender(
      <PixiStage
        onReady={() => {}}
        onResize={() => {}}
        preloadAssets={['/bonus-games/arenas/castle.webp']}
      />,
    );

    await waitFor(() => expect(pixiMock.load).toHaveBeenCalledTimes(2));
    expect(pixiMock.load).toHaveBeenLastCalledWith(['/bonus-games/arenas/castle.webp']);
    expect(pixiMock.destroy).not.toHaveBeenCalled();
    expect(view.container.querySelectorAll('canvas')).toHaveLength(1);
  });
});
