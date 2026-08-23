import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
});
