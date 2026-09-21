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
    expect(screen.getByText('Результат')).toHaveClass('section-label');
    expect(screen.getByRole('dialog', { name: 'Упражнение завершено' })).toHaveClass(
      'duel-result-card',
    );
    expect(document.querySelector('.initial-training-result__mark')).toBeNull();
    expect(screen.getByLabelText('Звёзды: +1')).toHaveStyle({ color: 'var(--reward-star)' });
    expect(screen.getByLabelText('Опыт: +1')).toHaveStyle({ color: 'var(--reward-experience)' });
    expect(screen.getByTestId('initial-training-result-star')).toHaveAttribute('fill', 'currentColor');
    expect(screen.getByTestId('initial-training-result-experience')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Следующий уровень' }));
    fireEvent.click(screen.getByRole('button', { name: 'К упражнениям' }));
    expect(onNext).toHaveBeenCalledOnce();
    expect(onCourse).toHaveBeenCalledOnce();
  });

  it('continues from the fifth exercise to the next level', () => {
    const onNext = vi.fn();
    render(
      <InitialTrainingResult
        exercisePosition={5}
        reward={null}
        onNext={onNext}
        onCourse={vi.fn()}
        onOpenTraining={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Следующий уровень' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Следующий уровень' }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('opens free training after the seventh exercise', () => {
    const onOpenTraining = vi.fn();
    render(
      <InitialTrainingResult
        exercisePosition={7}
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
