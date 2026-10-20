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
  beginner_training_completed: false,
  total_count: 7,
  open_training_unlocked: false,
  open_training_unlock_source: null,
  gameplay_lock: null,
  advanced_training: {
    enabled: true,
    access: {
      amateur_completed: true,
      beginner_training_completed: false,
      unlocked: false,
    },
    completed_count: 0,
    total_count: 8,
    exercises: [],
  },
  exercises: [
    {
      key: 'first-shot',
      position: 1,
      title: 'Первый бросок',
      description: 'Попади в неподвижные пустые ворота.',
      targetGoals: 10,
      rewardStars: 1,
      rewardExperience: 1,
      state: 'completed',
    },
    {
      key: 'three-positions',
      position: 2,
      title: 'Три позиции',
      description: 'Забивай слева, по центру и справа.',
      targetGoals: 9,
      rewardStars: 1,
      rewardExperience: 1,
      state: 'available',
    },
    {
      key: 'follow-the-goal',
      position: 3,
      title: 'Следи за воротами',
      description: 'Ворота меняют позицию.',
      targetGoals: 10,
      rewardStars: 1,
      rewardExperience: 1,
      state: 'locked',
    },
    {
      key: 'moving-goal',
      position: 4,
      title: 'Три зоны',
      description: 'Забей по 3 гола справа, слева и по центру.',
      targetGoals: 9,
      rewardStars: 1,
      rewardExperience: 1,
      state: 'locked',
    },
    {
      key: 'find-the-gap',
      position: 5,
      title: 'Три зоны с вратарём',
      description: 'Забей по 3 гола справа, слева и по центру с вратарём.',
      targetGoals: 9,
      rewardStars: 1,
      rewardExperience: 1,
      state: 'locked',
    },
    {
      key: 'pressure-window',
      position: 6,
      title: 'Меняй стороны',
      description: 'Чередуй стороны при бросках по пустым воротам.',
      targetGoals: 6,
      rewardStars: 1,
      rewardExperience: 1,
      state: 'locked',
    },
    {
      key: 'game-pace',
      position: 7,
      title: 'Игровой темп',
      description: 'Забивай в движущиеся ворота на скорости настоящей игры.',
      targetGoals: 6,
      rewardStars: 1,
      rewardExperience: 1,
      state: 'locked',
    },
  ],
};

describe('initial training course UI', () => {
  it('shows open, initial and advanced training as three concise section cards', () => {
    render(
      <InitialTrainingHub
        catalog={catalog}
        onOpenCourse={vi.fn()}
        onOpenTraining={vi.fn()}
        onOpenAdvanced={vi.fn()}
      />,
    );

    expect(screen.getByText('Начальный уровень')).toBeInTheDocument();
    expect(screen.getByText('Продвинутый уровень')).toBeInTheDocument();
    expect(document.querySelector('img[src="/sprites/initial-training-course-cover.webp"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Открытая тренировка/ })).toBeDisabled();
    expect(screen.getByText('1 из 7 упражнений')).toBeInTheDocument();
    expect(screen.getByText('Откроется после 7 упражнений')).toBeInTheDocument();
    const modeCards = screen.getAllByRole('button');
    expect(modeCards.map((card) => card.textContent)).toEqual([
      expect.stringContaining('Начальный уровень'),
      expect.stringContaining('Продвинутый уровень'),
      expect.stringContaining('Открытая тренировка'),
    ]);
  });

  it('uses the task-card pattern with task statuses and reward icons', () => {
    const onStart = vi.fn();
    render(<InitialTrainingCatalog catalog={catalog} onStart={onStart} />);

    expect(screen.getByText('Упражнения')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Прогресс' })).toBeInTheDocument();
    const progress = screen.getByRole('progressbar', { name: 'Прогресс начального обучения' });
    expect(progress).toHaveAttribute('aria-valuenow', '1');
    expect(progress).toHaveAttribute('aria-valuemax', '7');
    expect(within(progress).getByText('1 / 7')).toBeInTheDocument();

    expect(screen.getAllByRole('article')).toHaveLength(7);
    expect(screen.queryByRole('heading', { name: 'Текущее упражнение' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Пройденные/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Следующие/ })).not.toBeInTheDocument();

    for (const exercise of catalog.exercises) {
      expect(
        screen.getByRole('article', { name: `Упражнение ${exercise.position}: ${exercise.title}` }),
      ).toHaveClass('achievement-card');
      expect(
        screen
          .getByRole('article', { name: `Упражнение ${exercise.position}: ${exercise.title}` })
          .querySelector('.initial-training-preview__number'),
      ).toHaveClass('initial-training-preview__number');
    }

    expect(screen.getByText('Пройдено')).toHaveClass('achievement-card__stage');
    expect(screen.getByText('Первый бросок')).toHaveClass('achievement-card__title');
    expect(screen.getByText('Точность')).toHaveClass('initial-training-exercise-card__skill');
    expect(screen.getAllByText('Позиция')).toHaveLength(2);
    expect(screen.getByText('Чередование')).toHaveClass('initial-training-exercise-card__skill');
    expect(screen.getByText('Игра')).toHaveClass('initial-training-exercise-card__skill');
    expect(screen.getByText('Не пройдено')).toHaveClass(
      'training-exercise-card__stage--available',
    );
    expect(screen.getAllByText('Закрыто')).toHaveLength(5);
    screen.getAllByText('Закрыто').forEach((status) => {
      expect(status).toHaveClass('training-exercise-card__stage--locked');
    });
    expect(screen.getByLabelText('Упражнение пройдено')).toHaveClass(
      'achievement-card__status--claimed',
      'initial-training-exercise-card__completion',
    );
    expect(screen.queryByText('Повтор без награды')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('initial-training-reward-slot')).toHaveLength(7);
    expect(screen.getAllByTestId('initial-training-reward-star')).toHaveLength(7);
    expect(screen.getAllByTestId('initial-training-reward-experience')).toHaveLength(7);
    expect(screen.getByLabelText('Награда получена')).toHaveClass(
      'initial-training-exercise-card__rewards--claimed',
    );
    const availableCard = screen.getByRole('article', { name: 'Упражнение 2: Три позиции' });
    const metaRow = within(availableCard).getByText('Позиция').closest('.initial-training-exercise-card__meta');
    expect(metaRow).not.toBeNull();
    expect(within(metaRow as HTMLElement).getByText('·')).toBeInTheDocument();
    expect(within(metaRow as HTMLElement).getByText('Цель: 9 забитых шайб')).toBeInTheDocument();
    expect(within(metaRow as HTMLElement).queryByTestId('initial-training-reward-slot')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Начать: Три позиции' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Недоступно: Следи за воротами' })).toBeDisabled();
    const finalCard = screen.getByRole('article', { name: 'Упражнение 7: Игровой темп' });
    expect(within(finalCard).getByAltText('Дворовая сцена упражнения')).toHaveAttribute(
      'src',
      '/sprites/initial-training-course-cover.webp',
    );
    expect(within(finalCard).queryByAltText('Дворовой вратарь')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Начать: Три позиции' }));
    expect(onStart).toHaveBeenCalledWith('three-positions');
  });

  it('keeps all seven task cards equal when progress changes', () => {
    const { rerender } = render(<InitialTrainingCatalog catalog={catalog} onStart={vi.fn()} />);

    const progressedCatalog: InitialTrainingCatalogResponse = {
      ...catalog,
      completed_count: 2,
      exercises: catalog.exercises.map((exercise) =>
        exercise.position === 2
          ? { ...exercise, state: 'completed' as const }
          : exercise.position === 3
            ? { ...exercise, state: 'available' as const }
            : exercise,
      ),
    };
    rerender(<InitialTrainingCatalog catalog={progressedCatalog} onStart={vi.fn()} />);

    expect(screen.getAllByRole('article')).toHaveLength(7);
    expect(screen.getAllByLabelText('Упражнение пройдено')).toHaveLength(2);
    expect(screen.getAllByTestId('initial-training-reward-slot')).toHaveLength(7);
    expect(screen.getAllByText('Не пройдено')).toHaveLength(1);
    expect(screen.getAllByText('Закрыто')).toHaveLength(4);
    expect(screen.queryByRole('heading', { name: /Текущее упражнение|Пройденные|Следующие/ })).not.toBeInTheDocument();
  });

  it('keeps the exercise heading when the whole course is completed', () => {
    const completedCatalog: InitialTrainingCatalogResponse = {
      ...catalog,
      completed_count: 7,
      open_training_unlocked: true,
      open_training_unlock_source: 'course',
      exercises: catalog.exercises.map((exercise) => ({
        ...exercise,
        state: 'completed' as const,
      })),
    };

    render(<InitialTrainingCatalog catalog={completedCatalog} onStart={vi.fn()} />);

    expect(screen.getByText('Упражнения')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(7);
    expect(screen.getAllByLabelText('Упражнение пройдено')).toHaveLength(7);
  });

  it('maps verified shot feedback to useful Russian hints', () => {
    expect(initialTrainingFeedbackCopy('miss_left')).toBe(
      'Возьми чуть правее',
    );
    expect(initialTrainingFeedbackCopy('miss_right')).toBe(
      'Возьми чуть левее',
    );
    expect(initialTrainingFeedbackCopy('shot_wrong_zone', 'right')).toBe(
      'Бросок не в нужной зоне – бросай справа.',
    );
    expect(initialTrainingFeedbackCopy('goalie_blocked')).toBe(
      'Этот угол перекрыл вратарь.\nДождись свободной стороны.',
    );
    expect(initialTrainingFeedbackCopy('goal_timing')).toMatch(/тайминг/i);
  });
});
