import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { DAILY_PERIOD_SPEED_PRESETS } from '@hockey/game-core';
import { PlayView } from './DailyScreen.js';
import type * as ReactModule from 'react';
import { Goal } from '../game/renderer/Goal.js';

type PixiAppStub = {
  stage: { children: unknown[]; addChild: (child: unknown) => void };
  ticker: unknown;
};

const pixiHarness = vi.hoisted(() => ({
  app: null as PixiAppStub | null,
}));

vi.mock('../game/PixiStage.js', async () => {
  const React = await vi.importActual<typeof ReactModule>('react');
  return {
    PixiStage({
      onReady,
    }: {
      onReady: (
        app: PixiAppStub,
        scale: { factor: number; offsetX: number; offsetY: number },
      ) => void;
    }) {
      React.useEffect(() => {
        const app = {
          stage: {
            children: [] as unknown[],
            addChild(child: unknown) {
              this.children.push(child);
            },
          },
          ticker: {
            add: vi.fn(),
            remove: vi.fn(),
          },
        };
        pixiHarness.app = app;
        onReady(app, { factor: 1, offsetX: 0, offsetY: 0 });
      }, [onReady]);
      return <div data-testid="pixi-stage-stub" />;
    },
  };
});

vi.mock('../game/RinkSvg.js', () => ({
  RinkSvg: () => <div data-testid="rink-svg-stub" />,
}));

function rinkLayerChildren(): { visible: boolean }[] {
  const layer = pixiHarness.app?.stage.children[0] as { children?: { visible: boolean }[] } | undefined;
  return layer?.children ?? [];
}

const noopSubmit = async () => null;

function renderPlayView(props: { showIceCar: boolean }) {
  return render(
    <PlayView
      suppressedByModal={true}
      showIceCar={props.showIceCar}
      onBack={() => undefined}
      active={false}
      seed={null}
      goalieId="rookie"
      periodNumber={1}
      periodSpeedPresets={[...DAILY_PERIOD_SPEED_PRESETS]}
      goals={0}
      shots={0}
      shotsTotal={30}
      inactiveAction={() => null}
      optimisticAddShot={() => undefined}
      submitShot={noopSubmit}
      applyState={() => undefined}
    />,
  );
}

describe('PlayView rink availability visuals', () => {
  beforeEach(() => {
    pixiHarness.app = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('replaces the ice car with the goal when an unavailable rink becomes available', async () => {
    const view = renderPlayView({ showIceCar: true });

    await waitFor(() => {
      expect(rinkLayerChildren().length).toBeGreaterThanOrEqual(5);
    });
    expect(rinkLayerChildren()[0]?.visible).toBe(true);
    expect(rinkLayerChildren()[1]?.visible).toBe(false);

    view.rerender(
      <PlayView
        suppressedByModal={true}
        showIceCar={false}
        onBack={() => undefined}
        active={false}
        seed={null}
        goalieId="rookie"
        periodNumber={1}
        periodSpeedPresets={[...DAILY_PERIOD_SPEED_PRESETS]}
        goals={0}
        shots={0}
        shotsTotal={30}
        inactiveAction={() => null}
        optimisticAddShot={() => undefined}
        submitShot={noopSubmit}
        applyState={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(rinkLayerChildren()[0]?.visible).toBe(false);
      expect(rinkLayerChildren()[1]?.visible).toBe(true);
    });
  });

  it('keeps play controls above the compact dock inset by default', async () => {
    renderPlayView({ showIceCar: false });

    const root = await screen.findByRole('main');

    expect(root).toHaveStyle({
      bottom: 'calc(8px + var(--app-dock-safe-bottom))',
    });
  });

  it('keeps an already-visible goal in place while starting an inactive rink', async () => {
    const goalUpdate = vi.spyOn(Goal.prototype, 'update');
    const inactiveAction = vi.fn(() => null);
    render(
      <PlayView
        suppressedByModal={true}
        showIceCar={false}
        onBack={() => undefined}
        active={false}
        seed={null}
        goalieId="rookie"
        periodNumber={1}
        periodSpeedPresets={[...DAILY_PERIOD_SPEED_PRESETS]}
        goals={0}
        shots={0}
        shotsTotal={30}
        shotButtonLabel="НАЧАТЬ"
        inactiveAction={inactiveAction}
        entranceBeforeInactiveAction={true}
        optimisticAddShot={() => undefined}
        submitShot={noopSubmit}
        applyState={() => undefined}
      />,
    );

    await screen.findByRole('button', { name: 'НАЧАТЬ' });
    goalUpdate.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'НАЧАТЬ' }));

    await waitFor(() => expect(goalUpdate).toHaveBeenCalled());
    expect(inactiveAction).not.toHaveBeenCalled();
    expect(goalUpdate).toHaveBeenCalledWith(expect.anything(), 0, 0);
    expect(goalUpdate).not.toHaveBeenCalledWith(expect.anything(), 0, -140);
  });
});
