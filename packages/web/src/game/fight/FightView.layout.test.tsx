import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { createFightState, DEFAULT_FIGHT_RULES } from '@hockey/game-core';
import { FightView } from './FightView.js';
const { app } = vi.hoisted(() => {
  const app = {
    screen: { width: 430, height: 480 },
    canvas: { parentElement: { clientWidth: 320, clientHeight: 260 } },
    stage: { addChild: vi.fn() },
    renderer: {
      resize: vi.fn((width: number, height: number) => {
        app.screen.width = width;
        app.screen.height = height;
      }),
    },
  };
  return { app };
});
vi.mock('pixi.js', () => ({ Assets: { load: () => Promise.resolve([]) } }));
vi.mock('./Fighter.js', () => ({
  FIGHT_ASSETS: [],
  Fighter: class {
    view = { x: 0, y: 0, position: { set: vi.fn() } };
    targets = { head: { x: 0, y: -120 }, body: { x: 0, y: -70 } };
    update = vi.fn();
  },
}));
vi.mock('../PixiStage.js', async () => {
  const { useEffect } = await import('react');
  return {
    PixiStage: ({ onReady }: { onReady: (app: unknown) => void }) => {
      useEffect(() => {
        onReady(app);
      }, []);
      return null;
    },
  };
});
describe('fight canvas sizing', () => {
  it('fits the actual host when a smaller scene replaces the full-height renderer', async () => {
    render(
      <FightView
        state={createFightState(DEFAULT_FIGHT_RULES, 0)}
        player={0}
        nowMs={1000}
        onAction={() => {}}
      />,
    );
    await waitFor(() => expect(app.renderer.resize).toHaveBeenCalledWith(320, 260));
    expect(app.screen).toEqual({ width: 320, height: 260 });
  });
});
