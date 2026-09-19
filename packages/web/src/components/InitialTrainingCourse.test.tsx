import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { InitialTrainingCatalogResponse } from '../api/initialTraining.js';
import {
  InitialTrainingCatalog,
  InitialTrainingHub,
  initialTrainingFeedbackCopy,
} from './InitialTrainingCourse.js';

const catalog: InitialTrainingCatalogResponse = {
  enabled: true,
  completed_count: 1,
  total_count: 5,
  open_training_unlocked: false,
  open_training_unlock_source: null,
  gameplay_lock: null,
  exercises: [
    {
      key: 'first-shot',
      position: 1,
      title: 'Первый бросок',
      description: 'Попади в неподвижные ворота.',
      targetGoals: 5,
      rewardStars: 1,
      rewardExperience: 1,
      state: 'completed',
    },
    {
      key: 'three-positions',
      position: 2,
      title: 'Три позиции',
      description: 'Забивай слева, по центру и справа.',
      targetGoals: 6,
      rewardStars: 1,
      rewardExperience: 1,
      state: 'available',
    },
    {
      key: 'follow-the-goal',
      position: 3,
      title: 'Следи за воротами',
      description: 'Ворота меняют позицию.',
      targetGoals: 5,
      rewardStars: 1,
      rewardExperience: 1,
      state: 'locked',
    },
    {
      key: 'moving-goal',
      position: 4,
      title: 'Ворота в движении',
      description: 'Поймай движущиеся ворота.',
      targetGoals: 5,
      rewardStars: 1,
      rewardExperience: 1,
      state: 'locked',
    },
    {
      key: 'find-the-gap',
      position: 5,
      title: 'Найди свободный угол',
      description: 'Обыграй дворового вратаря.',
      targetGoals: 5,
      rewardStars: 1,
      rewardExperience: 1,
      state: 'locked',
    },
  ],
};

describe('initial training course UI', () => {
  it('shows two large modes, five progress segments and the open-training unlock condition', () => {
    render(
      <InitialTrainingHub
        catalog={catalog}
        onOpenCourse={vi.fn()}
        onOpenTraining={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /Начальное обучение/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Открытая тренировка/ })).toBeDisabled();
    expect(screen.getByText('1 из 5')).toBeInTheDocument();
    expect(screen.getByText('Пройдите все 5 упражнений: 1 из 5')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Прогресс начального обучения' }).children).toHaveLength(
      5,
    );
  });

  it('shows full exercise cards and starts only available or completed exercises', () => {
    const onStart = vi.fn();
    render(<InitialTrainingCatalog catalog={catalog} onStart={onStart} />);

    expect(screen.getAllByRole('article')).toHaveLength(5);
    expect(screen.getByText('Повтор без награды')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Начать: Три позиции' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Недоступно: Следи за воротами' })).toBeDisabled();
    const finalCard = screen.getByRole('article', { name: 'Упражнение 5: Найди свободный угол' });
    expect(within(finalCard).getByAltText('Дворовая сцена упражнения')).toHaveAttribute(
      'src',
      '/sprites/training-court.webp',
    );
    expect(within(finalCard).getByAltText('Дворовой вратарь')).toHaveAttribute(
      'src',
      '/sprites/training-goalie-amateur.webp',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Начать: Три позиции' }));
    expect(onStart).toHaveBeenCalledWith('three-positions');
  });

  it('maps verified shot feedback to useful Russian hints', () => {
    expect(initialTrainingFeedbackCopy('miss_left')).toBe(
      'Возьми чуть правее — бросок прошёл левее ворот.',
    );
    expect(initialTrainingFeedbackCopy('miss_right')).toBe(
      'Возьми чуть левее — бросок прошёл правее ворот.',
    );
    expect(initialTrainingFeedbackCopy('goalie_blocked')).toMatch(/вратарь/i);
    expect(initialTrainingFeedbackCopy('goal_timing')).toMatch(/тайминг/i);
  });
});
