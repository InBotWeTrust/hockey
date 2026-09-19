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
  total_count: 5,
  open_training_unlocked: false,
  open_training_unlock_source: null,
  gameplay_lock: null,
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
      title: 'Ворота в движении',
      description: 'Поймай движущиеся ворота.',
      targetGoals: 10,
      rewardStars: 1,
      rewardExperience: 1,
      state: 'locked',
    },
    {
      key: 'find-the-gap',
      position: 5,
      title: 'Найди свободный угол',
      description: 'Обыграй дворового вратаря.',
      targetGoals: 10,
      rewardStars: 1,
      rewardExperience: 1,
      state: 'locked',
    },
  ],
};

describe('initial training course UI', () => {
  it('shows the course and open-training modes as concise section cards', () => {
    render(
      <InitialTrainingHub
        catalog={catalog}
        onOpenCourse={vi.fn()}
        onOpenTraining={vi.fn()}
      />,
    );

    expect(screen.getByText('Начальный уровень')).toBeInTheDocument();
    expect(document.querySelector('img[src="/sprites/initial-training-course-cover.webp"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Открытая тренировка/ })).toBeDisabled();
    expect(screen.getByText('1 из 5 упражнений')).toBeInTheDocument();
    expect(screen.getByText('Откроется после 5 упражнений')).toBeInTheDocument();
  });

  it('uses the task-card pattern with task statuses and reward icons', () => {
    const onStart = vi.fn();
    render(<InitialTrainingCatalog catalog={catalog} onStart={onStart} />);

    expect(screen.getByText('Упражнения (5)')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Прогресс' })).toBeInTheDocument();
    const progress = screen.getByRole('progressbar', { name: 'Прогресс начального обучения' });
    expect(progress).toHaveAttribute('aria-valuenow', '1');
    expect(progress).toHaveAttribute('aria-valuemax', '5');
    expect(within(progress).getByText('1 / 5')).toBeInTheDocument();

    expect(screen.getAllByRole('article')).toHaveLength(5);
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
    expect(screen.getByText('Тайминг')).toHaveClass('initial-training-exercise-card__skill');
    expect(screen.getByText('Не пройдено')).toHaveClass(
      'initial-training-exercise-card__stage--available',
    );
    expect(screen.getAllByText('Закрыто')).toHaveLength(3);
    screen.getAllByText('Закрыто').forEach((status) => {
      expect(status).toHaveClass('initial-training-exercise-card__stage--locked');
    });
    expect(screen.getByLabelText('Упражнение пройдено')).toHaveClass(
      'achievement-card__status--claimed',
      'initial-training-exercise-card__completion',
    );
    expect(screen.queryByText('Повтор без награды')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('initial-training-reward-slot')).toHaveLength(5);
    expect(screen.getAllByTestId('initial-training-reward-star')).toHaveLength(5);
    expect(screen.getAllByTestId('initial-training-reward-experience')).toHaveLength(5);
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
    const finalCard = screen.getByRole('article', { name: 'Упражнение 5: Найди свободный угол' });
    expect(within(finalCard).getByAltText('Дворовая сцена упражнения')).toHaveAttribute(
      'src',
      '/sprites/initial-training-course-cover.webp',
    );
    expect(within(finalCard).queryByAltText('Дворовой вратарь')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Начать: Три позиции' }));
    expect(onStart).toHaveBeenCalledWith('three-positions');
  });

  it('keeps all five task cards equal when progress changes', () => {
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

    expect(screen.getAllByRole('article')).toHaveLength(5);
    expect(screen.getAllByLabelText('Упражнение пройдено')).toHaveLength(2);
    expect(screen.getAllByTestId('initial-training-reward-slot')).toHaveLength(5);
    expect(screen.getAllByText('Не пройдено')).toHaveLength(1);
    expect(screen.getAllByText('Закрыто')).toHaveLength(2);
    expect(screen.queryByRole('heading', { name: /Текущее упражнение|Пройденные|Следующие/ })).not.toBeInTheDocument();
  });

  it('collapses the exercise headings when the whole course is completed', () => {
    const completedCatalog: InitialTrainingCatalogResponse = {
      ...catalog,
      completed_count: 5,
      open_training_unlocked: true,
      open_training_unlock_source: 'course',
      exercises: catalog.exercises.map((exercise) => ({
        ...exercise,
        state: 'completed' as const,
      })),
    };

    render(<InitialTrainingCatalog catalog={completedCatalog} onStart={vi.fn()} />);

    expect(screen.queryByText('Упражнения (5)')).not.toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(5);
    expect(screen.getAllByLabelText('Упражнение пройдено')).toHaveLength(5);
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
