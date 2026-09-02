import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type GoalieConfig } from '@hockey/game-core';
import { PlayView, type PlayShotResolver } from './PlayView.js';
import type * as ReactModule from 'react';

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
            ticker: { add: vi.fn(), remove: vi.fn() },
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

  it('keeps the default result copy when no override is supplied', async () => {
    vi.useFakeTimers();
    render(
      <PlayView
        suppressedByModal={false}
        showIceCar={false}
        onBack={() => undefined}
        active
        seed="result-copy-seed"
        goalieId={null}
        goalieConfig={beachGoalie}
        periodNumber={1}
        goals={0}
        shots={0}
        shotResolver={() => ({ type: 'save', goalieContact: { x: 286, y: 80 } })}
        optimisticAddShot={() => undefined}
        submitShot={() => new Promise(() => undefined)}
        applyState={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'БРОСОК' }));
    await act(async () => vi.advanceTimersByTimeAsync(500));

    expect(screen.getByRole('status')).toHaveTextContent('СЭЙВ');
  });

  it('uses result copy only when an override is supplied', async () => {
    vi.useFakeTimers();
    render(
      <PlayView
        suppressedByModal={false}
        showIceCar={false}
        onBack={() => undefined}
        active
        seed="result-copy-seed"
        goalieId={null}
        goalieConfig={beachGoalie}
        periodNumber={1}
        goals={0}
        shots={0}
        resultCopy={{ save: 'Ещё раз' }}
        shotResolver={() => ({ type: 'save', goalieContact: { x: 286, y: 80 } })}
        optimisticAddShot={() => undefined}
        submitShot={() => new Promise(() => undefined)}
        applyState={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'БРОСОК' }));
    await act(async () => vi.advanceTimersByTimeAsync(500));

    expect(screen.getByRole('status')).toHaveTextContent('Ещё раз');
    expect(screen.getByRole('status')).not.toHaveTextContent('СЭЙВ');
  });

  it('reconciles visible result copy with a fast authoritative server result', async () => {
    vi.useFakeTimers();
    render(
      <PlayView
        suppressedByModal={false}
        showIceCar={false}
        onBack={() => undefined}
        active
        seed="authoritative-copy-seed"
        goalieId={null}
        goalieConfig={beachGoalie}
        periodNumber={1}
        goals={0}
        shots={0}
        resultCopy={{ goal: 'Первая шайба!', save: 'Ещё раз' }}
        shotResolver={() => ({ type: 'goal', hitPoint: { x: 286, y: 60 } })}
        optimisticAddShot={() => undefined}
        submitShot={async () => ({ serverResult: 'save', state: {} })}
        applyState={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'БРОСОК' }));
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.getByRole('status')).toHaveTextContent('Ещё раз');
    expect(screen.getByRole('status')).not.toHaveTextContent('Первая шайба!');
  });
});
