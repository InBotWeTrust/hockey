import { describe, it, expect, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

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
    destroy(): void {}
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
    const { container } = render(
      <PixiStage onReady={() => {}} onResize={() => {}} />,
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(container.querySelector('canvas')).not.toBeNull();
  });
});
