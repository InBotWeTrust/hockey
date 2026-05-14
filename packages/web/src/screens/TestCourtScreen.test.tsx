import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  GOAL_OPENING,
  PUCK_SPEED_PER_MS,
  PUCK_START,
  STICK_NEUTRAL,
  resolveShot,
  type GoalieConfig,
  type SessionPhaseOffsets,
  type ShotInput,
} from '@hockey/game-core';
import { TestCourtScreen, resolveTestCourtShot } from './TestCourtScreen.js';

vi.mock('../game/PixiStage.js', () => ({
  PixiStage: () => <div data-testid="pixi-stage-stub" />,
}));

describe('TestCourtScreen', () => {
  it('renders the experimental training court with arena perspective', () => {
    render(
      <MemoryRouter>
        <TestCourtScreen />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Тестовая площадка' })).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Тестовая площадка в перспективе' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'БРОСОК' })).toBeInTheDocument();
    const hitboxesToggle = screen.getByRole('checkbox', { name: 'Хитбоксы' });
    expect(hitboxesToggle).not.toBeChecked();
    fireEvent.click(hitboxesToggle);
    expect(hitboxesToggle).toBeChecked();
  });

  it('resolves shots against the same visual hitboxes shown in test court', () => {
    const goalieConfig: GoalieConfig = {
      id: 'visual-test',
      name: 'Visual Test',
      pattern: 'linear',
      hp: 1,
      baseReward: 0,
      firstClearBonus: 0,
      speed: 0,
      amplitude: 0,
      frequency: 1,
      goalAmplitude: 100,
      goalFrequency: 1,
    };
    const input: ShotInput = {
      tapTime: 0,
      shooterTapTime: ((335 - 286) / 231 + 1) * 250,
      puckSpeedPerMs: PUCK_SPEED_PER_MS,
      shooterFrequency: 1,
      goalieFrequency: 1,
      goalFrequency: 1,
    };
    const phaseOffsets: SessionPhaseOffsets = {
      goalie: 0,
      goal: 500 - (PUCK_START.y - GOAL_OPENING.y) / PUCK_SPEED_PER_MS,
      shooter: 0,
    };

    expect(resolveShot(input, goalieConfig, 'seed', 1, STICK_NEUTRAL, phaseOffsets).type).toBe(
      'miss',
    );
    expect(
      resolveTestCourtShot({
        input,
        goalieConfig,
        seed: 'seed',
        shotIndex: 1,
        stickEffects: STICK_NEUTRAL,
        phaseOffsets,
        shooterX: 335,
      }).type,
    ).toBe('goal');
  });
});
