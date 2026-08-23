import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DAILY_PERIOD_SPEED_PRESETS, type GoalieConfig } from '@hockey/game-core';
import { PlayView } from './PlayView.js';
import type * as ReactModule from 'react';

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
  it('renders the reusable play surface with a supplied goalie configuration', () => {
    render(
      <PlayView
        suppressedByModal
        showIceCar={false}
        onBack={() => undefined}
        active={false}
        seed={null}
        goalieId={null}
        goalieConfig={beachGoalie}
        periodNumber={1}
        periodSpeedPresets={DAILY_PERIOD_SPEED_PRESETS}
        goals={0}
        shots={0}
        shotsTotal={30}
        optimisticAddShot={() => undefined}
        submitShot={async () => null}
        applyState={() => undefined}
      />,
    );

    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});
