import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type GoalieConfig } from '@hockey/game-core';
import { PlayView, type PlayShotResolver } from './PlayView.js';
import type * as ReactModule from 'react';

const tickerCallbacks = vi.hoisted(() => [] as Array<() => void>);
const tickerEvents = vi.hoisted(() => [] as Array<'add' | 'remove'>);
const playerContainers = vi.hoisted(() => [] as Array<{ visible: boolean }>);
const goalieContainers = vi.hoisted(() => [] as Array<{ visible: boolean }>);

vi.mock('pixi.js', () => ({
  Container: class Container {
    children: unknown[] = [];
    addChild(...children: unknown[]): void {
      this.children.push(...children);
    }
  },
}));

vi.mock('./renderer/Goal.js', () => ({
  Goal: class Goal {
    container = { visible: true };
    update(): void {}
    destroy(): void {}
  },
}));

vi.mock('./renderer/Goalie.js', () => ({
  Goalie: class Goalie {
    container = { visible: true };
    constructor() {
      goalieContainers.push(this.container);
    }
    update(): void {}
    setSavePose(): void {}
    destroy(): void {}
  },
}));

vi.mock('./renderer/Hitboxes.js', () => ({
  Hitboxes: class Hitboxes {
    container = { visible: true };
    setVisible(): void {}
    update(): void {}
    destroy(): void {}
  },
}));

vi.mock('./renderer/IceCar.js', () => ({
  IceCar: class IceCar {
    container = { visible: false };
    update(): void {}
    destroy(): void {}
  },
  iceCarPosAt: () => ({ x: 0, y: 0, rot: 0, variant: 0 }),
}));

vi.mock('./renderer/Player.js', () => ({
  Player: class Player {
    container = { visible: true };
    constructor() {
      playerContainers.push(this.container);
    }
    update(): void {}
    playShot(): void {}
    destroy(): void {}
  },
}));

vi.mock('./renderer/Puck.js', () => ({
  Puck: class Puck {
    container = { visible: true };
    isFlying(): boolean {
      return false;
    }
    isHeld(): boolean {
      return false;
    }
    resetAtStart(): void {}
    shotPath(): { start: { x: number; y: number }; end: { x: number; y: number } } {
      return { start: { x: 286, y: 580 }, end: { x: 286, y: 60 } };
    }
    playShot(): void {}
    holdAt(): void {}
    release(): void {}
    update(): void {}
    destroy(): void {}
  },
}));

vi.mock('./PixiStage.js', async () => {
  const React = await vi.importActual<typeof ReactModule>('react');
  return {
    PixiStage({ onReady }: { onReady: (app: never, scale: never) => void }) {
      React.useEffect(() => {
        onReady(
          {
            stage: { addChild: vi.fn() },
            ticker: {
              add: vi.fn((callback: () => void) => {
                tickerCallbacks.push(callback);
                tickerEvents.push('add');
              }),
              remove: vi.fn(() => tickerEvents.push('remove')),
            },
          } as never,
          { factor: 1, offsetX: 0, offsetY: 0 } as never,
        );
      }, [onReady]);
      return <div data-testid="pixi-stage-stub" />;
    },
  };
});

const beachGoalie: GoalieConfig = {
  id: 'bonus:beach:p1',
  name: 'Пляж',
  pattern: 'linear',
  hp: 0,
  baseReward: 0,
  firstClearBonus: 0,
  speed: 0,
  amplitude: 1,
  frequency: 0.5,
  goalAmplitude: 220,
  goalFrequency: 0.45,
};

describe('PlayView', () => {
  beforeEach(() => {
    tickerCallbacks.length = 0;
    tickerEvents.length = 0;
    playerContainers.length = 0;
    goalieContainers.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('passes the exact supplied goalie configuration to local shot resolution', () => {
    const resolvedContexts: Parameters<PlayShotResolver>[0][] = [];
    const shotResolver: PlayShotResolver = (context) => {
      resolvedContexts.push(context);
      return { type: 'miss', reason: 'wide' };
    };

    render(
      <PlayView
        suppressedByModal={false}
        showIceCar={false}
        onBack={() => undefined}
        active
        seed="bonus-seed"
        goalieId="rookie"
        goalieConfig={beachGoalie}
        periodNumber={1}
        speedOverrides={{
          goalFreq: beachGoalie.goalFrequency,
          goalieFreq: beachGoalie.frequency,
          shooterFreq: 0.45,
          puckSpeed: 1.2,
        }}
        goals={0}
        shots={0}
        shotsTotal={30}
        shotResolver={shotResolver}
        optimisticAddShot={() => undefined}
        submitShot={() => new Promise(() => undefined)}
        applyState={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'БРОСОК' }));

    expect(resolvedContexts).toHaveLength(1);
    expect(resolvedContexts[0]?.goalieConfig).toEqual(beachGoalie);
  });

  it('uses separate authoritative scene and shooter clocks for the next tap', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const shotResolver: PlayShotResolver = vi.fn(() => ({ type: 'miss', reason: 'wide' }));

    render(
      <PlayView
        suppressedByModal={false}
        showIceCar={false}
        onBack={() => undefined}
        active
        seed="bonus-seed"
        goalieId={null}
        goalieConfig={beachGoalie}
        periodNumber={1}
        speedOverrides={{ goalFreq: 0.45, goalieFreq: 0.5, shooterFreq: 0.65, puckSpeed: 1.2 }}
        goals={0}
        shots={3}
        shotsTotal={30}
        initialSceneElapsedMs={6_000}
        initialShooterElapsedMs={4_700}
        receivedAtPerformanceMs={1_000}
        clockRebaseKey="period-1:response-1"
        shotResolver={shotResolver}
        optimisticAddShot={() => undefined}
        submitShot={() => new Promise(() => undefined)}
        applyState={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'БРОСОК' }));

    expect(shotResolver).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ tapTime: 6_000, shooterTapTime: 4_700 }),
      }),
    );
  });

  it('rebases separate clocks when a reconciled authoritative snapshot arrives', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const shotResolver: PlayShotResolver = vi.fn(() => ({ type: 'miss', reason: 'wide' }));
    const commonProps = {
      suppressedByModal: false,
      showIceCar: false,
      onBack: () => undefined,
      active: true,
      seed: 'bonus-seed',
      goalieId: null,
      goalieConfig: beachGoalie,
      periodNumber: 1,
      speedOverrides: { goalFreq: 0.45, goalieFreq: 0.5, shooterFreq: 0.65, puckSpeed: 1.2 },
      goals: 0,
      shots: 3,
      shotsTotal: 30,
      receivedAtPerformanceMs: 1_000,
      shotResolver,
      optimisticAddShot: () => undefined,
      submitShot: () => new Promise<null>(() => undefined),
      applyState: () => undefined,
    } as const;
    const view = render(
      <PlayView
        {...commonProps}
        initialSceneElapsedMs={500}
        initialShooterElapsedMs={500}
        clockRebaseKey="period-1:response-1"
      />,
    );

    view.rerender(
      <PlayView
        {...commonProps}
        initialSceneElapsedMs={8_000}
        initialShooterElapsedMs={6_500}
        clockRebaseKey="period-1:response-2"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'БРОСОК' }));

    expect(shotResolver).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ tapTime: 8_000, shooterTapTime: 6_500 }),
      }),
    );
  });

  it('includes time elapsed since a deferred active response in the next slow-puck clock basis', () => {
    // Response receipt was t=1000; the visual boundary applies at t=4321, so both clocks add 3321ms.
    vi.spyOn(performance, 'now').mockReturnValue(4_321);
    const shotResolver: PlayShotResolver = vi.fn(() => ({ type: 'miss', reason: 'wide' }));

    render(
      <PlayView
        suppressedByModal={false}
        showIceCar={false}
        onBack={() => undefined}
        active
        seed="bonus-seed"
        goalieId={null}
        goalieConfig={beachGoalie}
        periodNumber={1}
        speedOverrides={{ goalFreq: 0.45, goalieFreq: 0.5, shooterFreq: 0.65, puckSpeed: 0.25 }}
        goals={2}
        shots={3}
        shotsTotal={30}
        initialSceneElapsedMs={7_000}
        initialShooterElapsedMs={760}
        receivedAtPerformanceMs={1_000}
        clockRebaseKey="period-1:deferred-response"
        shotResolver={shotResolver}
        optimisticAddShot={() => undefined}
        submitShot={() => new Promise(() => undefined)}
        applyState={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'БРОСОК' }));

    expect(shotResolver).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          tapTime: 10_321,
          shooterTapTime: 4_081,
          puckSpeedPerMs: 0.25,
        }),
      }),
    );
  });

  it('allows one optimistic display increment for two synchronous taps', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const optimisticAddShot = vi.fn();
    const submitShot = vi.fn(() => new Promise<null>(() => undefined));

    render(
      <PlayView
        suppressedByModal={false}
        showIceCar={false}
        onBack={() => undefined}
        active
        seed="bonus-seed"
        goalieId={null}
        goalieConfig={beachGoalie}
        periodNumber={1}
        goals={0}
        shots={0}
        shotsTotal={30}
        shotResolver={() => ({ type: 'miss', reason: 'wide' })}
        optimisticAddShot={optimisticAddShot}
        submitShot={submitShot}
        applyState={() => undefined}
      />,
    );
    const shotButton = screen.getByRole('button', { name: 'БРОСОК' });

    fireEvent.click(shotButton);
    fireEvent.click(shotButton);

    expect(optimisticAddShot).toHaveBeenCalledTimes(1);
    expect(submitShot).toHaveBeenCalledTimes(1);
  });

  it('blocks the primary action without stopping an active scene', () => {
    render(
      <PlayView
        suppressedByModal={false}
        showIceCar={false}
        onBack={() => undefined}
        active
        primaryActionBlocked
        seed="bonus-seed"
        goalieId={null}
        goalieConfig={beachGoalie}
        periodNumber={1}
        goals={0}
        shots={0}
        shotsTotal={30}
        shotButtonLabel="ПРОВЕРЯЕМ..."
        optimisticAddShot={() => undefined}
        submitShot={async () => null}
        applyState={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: 'ПРОВЕРЯЕМ...' })).toBeDisabled();
  });

  it('keeps an inactive rink at goals-only when a blocking preview closes', async () => {
    const commonProps = {
      showIceCar: false,
      onBack: () => undefined,
      active: false,
      seed: 'bonus-seed',
      goalieId: null,
      goalieConfig: beachGoalie,
      periodNumber: 1,
      goals: 0,
      shots: 0,
      shotsTotal: 30,
      shotButtonLabel: 'НАЧАТЬ',
      inactiveAction: async () => null,
      entranceBeforeInactiveAction: true,
      goalsOnlyWhileInactive: true,
      optimisticAddShot: () => undefined,
      submitShot: async () => null,
      applyState: () => undefined,
    } as const;
    const view = render(<PlayView {...commonProps} suppressedByModal />);
    await act(async () => Promise.resolve());

    expect(playerContainers.at(-1)?.visible).toBe(false);
    expect(goalieContainers.at(-1)?.visible).toBe(false);

    view.rerender(<PlayView {...commonProps} suppressedByModal={false} />);

    expect(playerContainers.at(-1)?.visible).toBe(false);
    expect(goalieContainers.at(-1)?.visible).toBe(false);
    expect(screen.getByRole('button', { name: 'НАЧАТЬ' })).toBeEnabled();
  });

  it('does not hide an inactive rink just because its action plays an entrance first', async () => {
    render(
      <PlayView
        suppressedByModal={false}
        showIceCar={false}
        onBack={() => undefined}
        active={false}
        seed="daily-seed"
        goalieId={null}
        goalieConfig={beachGoalie}
        periodNumber={1}
        goals={0}
        shots={0}
        shotsTotal={30}
        shotButtonLabel="НАЧАТЬ"
        inactiveAction={async () => null}
        entranceBeforeInactiveAction
        optimisticAddShot={() => undefined}
        submitShot={async () => null}
        applyState={() => undefined}
      />,
    );
    await act(async () => Promise.resolve());

    expect(playerContainers.at(-1)?.visible).toBe(true);
    expect(goalieContainers.at(-1)?.visible).toBe(true);
  });

  it('keeps authoritative clocks continuous through the shot result pause', async () => {
    vi.useFakeTimers();
    let now = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const shotResolver: PlayShotResolver = vi.fn(() => ({ type: 'miss', reason: 'wide' }));
    const resolvedSnapshot = {
      initialSceneElapsedMs: 434,
      initialShooterElapsedMs: 0,
      receivedAtPerformanceMs: 1_434,
      clockRebaseKey: 'period-1',
    };
    const submitShot = vi.fn(async () => ({
      serverResult: 'miss' as const,
      state: resolvedSnapshot,
    }));
    const commonProps = {
      suppressedByModal: false,
      showIceCar: false,
      onBack: () => undefined,
      active: true,
      seed: 'bonus-seed',
      goalieId: null,
      goalieConfig: beachGoalie,
      periodNumber: 1,
      goals: 0,
      shotsTotal: 30,
      initialSceneElapsedMs: 0,
      initialShooterElapsedMs: 0,
      receivedAtPerformanceMs: 1_000,
      clockRebaseKey: 'period-1',
      speedOverrides: { goalFreq: 0.45, goalieFreq: 0.5, shooterFreq: 0.65, puckSpeed: 1.2 },
      continuousClockDuringResult: true,
      freezeRenderingDuringResult: true,
      shotResolver,
      optimisticAddShot: () => undefined,
      submitShot,
      applyState: () => undefined,
    } as const;
    function applyResolvedState(snapshot: typeof resolvedSnapshot): void {
      view.rerender(
        <PlayView
          {...commonProps}
          {...snapshot}
          shots={1}
          applyResolvedState={applyResolvedState}
        />,
      );
    }
    const view = render(
      <PlayView
        {...commonProps}
        shots={0}
        applyResolvedState={applyResolvedState}
      />,
    );
    await act(async () => Promise.resolve());

    fireEvent.click(screen.getByRole('button', { name: 'БРОСОК' }));
    await act(async () => Promise.resolve());

    now = 1_434;
    act(() => tickerCallbacks.at(-1)?.());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(434);
    });
    expect(tickerEvents.at(-1)).toBe('remove');
    now = 2_434;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(tickerEvents.at(-1)).toBe('add');
    act(() => tickerCallbacks.at(-1)?.());

    fireEvent.click(screen.getByRole('button', { name: 'БРОСОК' }));
    await act(async () => Promise.resolve());

    expect(shotResolver).toHaveBeenLastCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          tapTime: 1_434,
          shooterTapTime: 1_000.666_666_666_666_6,
        }),
      }),
    );
  });

  it('does not accumulate a rejected shot in the next authoritative clock relation', async () => {
    // A rejected request is not part of the server shot history. Its visual flight must not
    // remain in the shooter/scene clock delta, regardless of how many accepted shots the
    // admin-configured game contains.
    vi.useFakeTimers();
    let now = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const shotResolver: PlayShotResolver = vi.fn(() => ({ type: 'miss', reason: 'wide' }));

    render(
      <PlayView
        suppressedByModal={false}
        showIceCar={false}
        onBack={() => undefined}
        active
        seed="bonus-seed"
        goalieId={null}
        goalieConfig={beachGoalie}
        periodNumber={1}
        goals={0}
        shots={55}
        shotsTotal={100}
        initialSceneElapsedMs={80_000}
        initialShooterElapsedMs={58_333.333_333_333_33}
        receivedAtPerformanceMs={1_000}
        clockRebaseKey="period-1"
        speedOverrides={{ goalFreq: 0.45, goalieFreq: 0.5, shooterFreq: 0.65, puckSpeed: 1.2 }}
        shotResolver={shotResolver}
        optimisticAddShot={() => undefined}
        submitShot={async () => null}
        applyState={() => undefined}
      />,
    );
    await act(async () => Promise.resolve());

    fireEvent.click(screen.getByRole('button', { name: 'БРОСОК' }));
    await act(async () => Promise.resolve());

    now = 2_434;
    act(() => tickerCallbacks.at(-1)?.());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_434);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'БРОСОК' }));
      await Promise.resolve();
    });

    expect(shotResolver).toHaveBeenLastCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          tapTime: 81_434,
          shooterTapTime: 59_767.333_333_333_33,
        }),
      }),
    );
  });

  it('rebases a rejected final shot from the refreshed server timing before the retry', async () => {
    // Break caught: the rejected request resolved before React committed the refreshed daily
    // snapshot, so an immediate rebase reused stale clocks and made several retries fail.
    vi.useFakeTimers();
    let now = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const shotResolver: PlayShotResolver = vi.fn(() => ({ type: 'miss', reason: 'wide' }));
    let resolveSubmit: ((value: null) => void) | undefined;
    const submitShot = vi.fn(
      () =>
        new Promise<null>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    const commonProps = {
      suppressedByModal: false,
      showIceCar: false,
      onBack: () => undefined,
      active: true,
      seed: 'daily-seed',
      goalieId: null,
      goalieConfig: beachGoalie,
      periodNumber: 1,
      speedOverrides: { goalFreq: 0.45, goalieFreq: 0.5, shooterFreq: 0.65, puckSpeed: 1.2 },
      goals: 29,
      shots: 29,
      shotsTotal: 30,
      shotResolver,
      optimisticAddShot: () => undefined,
      submitShot,
      applyState: () => undefined,
    } as const;
    const view = render(
      <PlayView
        {...commonProps}
        initialSceneElapsedMs={1_000}
        initialShooterElapsedMs={1_000}
        receivedAtPerformanceMs={1_000}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'БРОСОК' }));
    now = 2_500;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
      resolveSubmit?.(null);
      await Promise.resolve();
    });

    view.rerender(
      <PlayView
        {...commonProps}
        initialSceneElapsedMs={10_000}
        initialShooterElapsedMs={8_000}
        receivedAtPerformanceMs={2_500}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });

    fireEvent.click(screen.getByRole('button', { name: 'БРОСОК' }));

    expect(shotResolver).toHaveBeenLastCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ tapTime: 10_000, shooterTapTime: 8_000 }),
      }),
    );
  });

  it('applies a fast authoritative result only after the flight and result pause', async () => {
    // This catches a completed, failed, or break DTO replacing the rink during its final animation.
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const applyState = vi.fn();
    const applyResolvedState = vi.fn();
    const submitShot = vi.fn(async () => ({
      serverResult: 'goal' as const,
      state: { status: 'completed' as const, rewardGranted: true },
    }));

    render(
      <PlayView
        suppressedByModal={false}
        showIceCar={false}
        onBack={() => undefined}
        active
        seed="bonus-seed"
        goalieId={null}
        goalieConfig={beachGoalie}
        periodNumber={1}
        speedOverrides={{ goalFreq: 0.45, goalieFreq: 0.5, shooterFreq: 0.65, puckSpeed: 1.2 }}
        goals={2}
        shots={2}
        shotsTotal={3}
        shotResolver={() => ({ type: 'goal', hitPoint: { x: 286, y: 60 } })}
        optimisticAddShot={() => undefined}
        submitShot={submitShot}
        applyState={applyState}
        applyResolvedState={applyResolvedState}
      />,
    );

    const shotButton = screen.getByRole('button', { name: 'БРОСОК' });
    fireEvent.click(shotButton);
    await act(async () => Promise.resolve());

    expect(shotButton).toBeDisabled();
    expect(applyResolvedState).not.toHaveBeenCalled();
    expect(applyState).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_430);
    });
    expect(applyResolvedState).not.toHaveBeenCalled();
    expect(shotButton).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(applyResolvedState).toHaveBeenCalledTimes(1);
    expect(applyResolvedState).toHaveBeenCalledWith({
      status: 'completed',
      rewardGranted: true,
    });
    expect(applyState).not.toHaveBeenCalled();
  });
});
