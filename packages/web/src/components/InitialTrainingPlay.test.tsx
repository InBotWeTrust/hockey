import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { STICK_NEUTRAL, getGoalie, getSessionPhaseOffsets, type ShotInput } from '@hockey/game-core';
import {
  InitialTrainingResult,
  resolveInitialTrainingClientShot,
} from './InitialTrainingPlay.js';

describe('initial training play', () => {
  it('uses empty-goal resolution when the exercise has no goalkeeper', () => {
    const input: ShotInput = {
      tapTime: 100,
      shooterTapTime: 100,
      shooterFrequency: 1,
      goalieFrequency: 1,
      goalFrequency: 0,
      puckSpeedPerMs: 1.2,
    };
    const goalieConfig = { ...getGoalie('rookie'), goalAmplitude: 0, goalFrequency: 0 };
    const result = resolveInitialTrainingClientShot(false, {
      input,
      goalieConfig,
      seed: 'a'.repeat(64),
      shotIndex: 1,
      stickEffects: STICK_NEUTRAL,
      phaseOffsets: getSessionPhaseOffsets('a'.repeat(64)),
      shooterX: 0,
    });

    expect(result.type).not.toBe('save');
  });

  it('offers the next exercise and the course catalog after a level', () => {
    const onNext = vi.fn();
    const onCourse = vi.fn();
    render(
      <InitialTrainingResult
        exercisePosition={2}
        reward={{ stars: 1, experience: 1 }}
        onNext={onNext}
        onCourse={onCourse}
        onOpenTraining={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Упражнение завершено' })).toBeInTheDocument();
    expect(screen.getByText('+1 звезда · +1 опыт')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Следующий уровень' }));
    fireEvent.click(screen.getByRole('button', { name: 'К упражнениям' }));
    expect(onNext).toHaveBeenCalledOnce();
    expect(onCourse).toHaveBeenCalledOnce();
  });

  it('opens the free training after the fifth exercise', () => {
    const onOpenTraining = vi.fn();
    render(
      <InitialTrainingResult
        exercisePosition={5}
        reward={null}
        onNext={vi.fn()}
        onCourse={vi.fn()}
        onOpenTraining={onOpenTraining}
      />,
    );

    expect(screen.getByText('Повтор завершён без награды')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'В открытую тренировку' }));
    expect(onOpenTraining).toHaveBeenCalledOnce();
  });
});
