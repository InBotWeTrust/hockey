import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  AdvancedTrainingCatalog,
  AdvancedTrainingHubCard,
  advancedTrainingFeedbackCopy,
  advancedTrainingFeedbackTone,
  type AdvancedTrainingCatalogModel,
} from './AdvancedTrainingCourse.js';

const exercises: AdvancedTrainingCatalogModel['exercises'] = [
  ['board-side', 1, 'У борта', 'Забей из крайнего сектора.', 'Позиция', 'Гол у борта', 'completed'],
  ['open-net', 2, 'Открытые ворота', 'Дождись свободного створа.', 'Обзор', 'Гол в свободный створ', 'available'],
  ['crossing', 3, 'На пересечении', 'Поймай короткое центральное окно.', 'Тайминг', '7 из 10 ситуаций', 'locked'],
  ['goalie-leaving', 4, 'Вратарь отъехал', 'Брось сразу после ухода вратаря.', 'Реакция', '7 из 10 ситуаций', 'locked'],
  ['narrow-gap', 5, 'Узкий просвет', 'Попади в частично закрытый створ.', 'Меткость', '7 из 10 ситуаций', 'locked'],
  ['counter-direction', 6, 'Противоход', 'Направь шайбу против движения вратаря.', 'Противоход', '7 из 10 ситуаций', 'locked'],
  ['second-tempo', 7, 'Второй темп', 'Заверши серию быстрых бросков.', 'Серия', '7 из 10 ситуаций', 'locked'],
  ['rhythm-reset', 8, 'Бонусное упражнение', null, null, null, 'locked'],
].map(([key, position, title, description, skill, goal, state]) => ({
  key: key as AdvancedTrainingCatalogModel['exercises'][number]['key'],
  position: position as number,
  title: title as string,
  description: description as string | null,
  skill: skill as string | null,
  goal: goal as string | null,
  rewardStars: 1,
  rewardExperience: 1,
  state: state as AdvancedTrainingCatalogModel['exercises'][number]['state'],
}));

const catalog: AdvancedTrainingCatalogModel = {
  completedCount: 1,
  totalCount: 8,
  exercises,
};

describe('advanced training course UI', () => {
  it.each([
    ['technique_success', 'Приём выполнен', 'success'],
    ['early', 'Рано', 'error'],
    ['late', 'Поздно', 'error'],
    ['goalie_blocked', 'Сэйв', 'error'],
    ['miss_wide', 'Мимо', 'error'],
    ['goal_wrong_technique', 'Гол, но', 'error'],
    ['intentional_miss_required', 'намеренно промахнуться', 'error'],
    ['series_step_accepted', 'Бросок серии выполнен', 'success'],
    ['series_incomplete', 'Серия не завершена', 'error'],
  ] as const)('maps %s to an instructional post-shot notice', (code, copy, tone) => {
    expect(advancedTrainingFeedbackCopy(code)).toContain(copy);
    expect(advancedTrainingFeedbackTone(code)).toBe(tone);
  });

  it('uses its own artwork on the global course card', () => {
    render(
      <AdvancedTrainingHubCard
        completedCount={1}
        totalCount={8}
        unlocked
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /Продвинутый уровень/ })).toBeEnabled();
    expect(screen.getByAltText('Продвинутый уровень')).toHaveAttribute(
      'src',
      '/sprites/advanced-training-course-cover.webp',
    );
  });

  it('marks only the artwork as locked when the global course is unavailable', () => {
    render(
      <AdvancedTrainingHubCard
        completedCount={0}
        totalCount={8}
        unlocked={false}
        access={{ amateur_completed: true, beginner_training_completed: false }}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /Продвинутый уровень/ })).toBeDisabled();
    expect(screen.getByAltText('Продвинутый уровень')).toHaveClass(
      'advanced-training-mode-card__artwork--locked',
    );
  });

  it('renders eight equal task cards from the shared artwork with numbered overlays', () => {
    render(<AdvancedTrainingCatalog catalog={catalog} onStart={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Прогресс' })).toBeInTheDocument();
    expect(screen.getByText('Упражнения (8)')).toBeInTheDocument();
    expect(within(screen.getByRole('progressbar')).getByText('1 / 8')).toBeInTheDocument();
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(8);
    cards.forEach((card, index) => {
      expect(card).toHaveClass('achievement-card', 'achievement-card--list');
      expect(within(card).getByAltText('Продвинутая хоккейная тренировка')).toHaveAttribute(
        'src',
        '/sprites/advanced-training-course-cover.webp',
      );
      expect(within(card).getByLabelText(`Упражнение ${index + 1}`)).toHaveTextContent(
        String(index + 1),
      );
    });
    expect(screen.getByText('Пройдено')).toBeInTheDocument();
    expect(screen.getByText('Не пройдено')).toBeInTheDocument();
    expect(screen.getAllByText('Закрыто')).toHaveLength(6);
    screen.getAllByText('Закрыто').forEach((status) => {
      expect(status).toHaveClass('training-exercise-card__stage--locked');
    });
    expect(screen.queryByText('Сброс ритма')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('advanced-training-reward-slot')).toHaveLength(8);
    expect(screen.getAllByTestId('advanced-training-reward-star')).toHaveLength(8);
    expect(screen.getAllByTestId('advanced-training-reward-experience')).toHaveLength(8);
    expect(screen.getByLabelText('Награда получена')).toHaveClass(
      'advanced-training-exercise-card__rewards--claimed',
    );
    expect(screen.getByLabelText('Упражнение пройдено')).toHaveClass(
      'advanced-training-exercise-card__completion',
    );
  });

  it('opens a descriptive modal before starting an available exercise', () => {
    const onStart = vi.fn();
    render(<AdvancedTrainingCatalog catalog={catalog} onStart={onStart} />);

    fireEvent.click(screen.getByRole('button', { name: 'Начать: Открытые ворота' }));

    expect(onStart).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'Открытые ворота' });
    expect(within(dialog).getByRole('heading', { name: 'Открытые ворота' })).toBeInTheDocument();
    expect(within(dialog).getByText('Дождись свободного створа.')).toBeInTheDocument();
    expect(dialog.querySelector('.advanced-training-start-modal__goal')).toHaveTextContent(
      'Цель: Гол в свободный створ',
    );
    const startButton = within(dialog).getByRole('button', { name: 'Начать' });
    expect(startButton).toHaveClass('btn--cta');
    fireEvent.click(startButton);
    expect(onStart).toHaveBeenCalledWith('open-net');
  });

  it('allows replay through the same modal and keeps locked exercises inert', () => {
    const onStart = vi.fn();
    render(<AdvancedTrainingCatalog catalog={catalog} onStart={onStart} />);

    fireEvent.click(screen.getByRole('button', { name: 'Повторить: У борта' }));
    expect(screen.getByRole('dialog', { name: 'У борта' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));

    expect(screen.getByRole('button', { name: 'Недоступно: На пересечении' })).toBeDisabled();
    expect(screen.queryByText('Поймай короткое центральное окно.')).not.toBeInTheDocument();
    expect(onStart).not.toHaveBeenCalled();
  });
});
