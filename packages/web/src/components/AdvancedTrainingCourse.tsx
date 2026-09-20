import { useState } from 'react';
import { Check, ChevronRight, Star, TrendingUp, X } from 'lucide-react';
import { rewardColor } from '../app/rewardColors.js';
import { AccessibleModal } from './AccessibleModal.js';

export type AdvancedTrainingExerciseKey =
  | 'board-side'
  | 'open-net'
  | 'crossing'
  | 'goalie-leaving'
  | 'narrow-gap'
  | 'counter-direction'
  | 'second-tempo'
  | 'rhythm-reset';

export type AdvancedTrainingFeedbackCode =
  | 'technique_success'
  | 'early'
  | 'late'
  | 'goalie_blocked'
  | 'miss_wide'
  | 'goal_wrong_technique'
  | 'intentional_miss_required'
  | 'series_step_accepted'
  | 'series_incomplete';

const advancedTrainingFeedback: Record<AdvancedTrainingFeedbackCode, string> = {
  technique_success: 'Приём выполнен — продолжай в том же ритме!',
  early: 'Рано — дай ситуации раскрыться и бросай чуть позже.',
  late: 'Поздно — окно уже закрылось, попробуй бросить раньше.',
  goalie_blocked: 'Сэйв — вратарь перекрыл траекторию. Ищи свободную сторону.',
  miss_wide: 'Мимо — скорректируй направление броска по створу.',
  goal_wrong_technique: 'Гол, но нужен приём этого упражнения.',
  intentional_miss_required: 'Сначала нужно было намеренно промахнуться, чтобы сбросить ритм.',
  series_step_accepted: 'Бросок серии выполнен — продолжай комбинацию.',
  series_incomplete: 'Серия не завершена — следующий бросок должен продолжить комбинацию.',
};

export function advancedTrainingFeedbackCopy(code: AdvancedTrainingFeedbackCode): string {
  return advancedTrainingFeedback[code];
}

export function advancedTrainingFeedbackTone(
  code: AdvancedTrainingFeedbackCode,
): 'success' | 'error' {
  return code === 'technique_success' || code === 'series_step_accepted'
    ? 'success'
    : 'error';
}

export interface AdvancedTrainingCatalogExercise {
  key: AdvancedTrainingExerciseKey;
  position: number;
  title: string;
  description: string | null;
  skill: string | null;
  goal: string | null;
  rewardStars: number;
  rewardExperience: number;
  state: 'completed' | 'available' | 'locked';
}

export interface AdvancedTrainingCatalogModel {
  completedCount: number;
  totalCount: number;
  exercises: AdvancedTrainingCatalogExercise[];
}

const ADVANCED_COVER = '/sprites/advanced-training-course-cover.webp';

export function AdvancedTrainingHubCard({
  completedCount,
  totalCount,
  unlocked,
  access,
  onOpen,
}: {
  completedCount: number;
  totalCount: number;
  unlocked: boolean;
  access?: {
    amateur_completed: boolean;
    beginner_training_completed: boolean;
  };
  onOpen: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="section-card-surface amateur-hub-card advanced-training-mode-card"
      disabled={!unlocked}
      onClick={onOpen}
      aria-label={`Продвинутый уровень, пройдено ${completedCount} из ${totalCount} упражнений`}
    >
      <span className="amateur-hub-card__art" aria-hidden="true">
        <img
          src={ADVANCED_COVER}
          alt="Продвинутый уровень"
          className={unlocked ? undefined : 'advanced-training-mode-card__artwork--locked'}
          draggable={false}
        />
      </span>
      <span className="amateur-hub-card__copy">
        <strong>Продвинутый уровень</strong>
        <span>
          {unlocked
            ? `${completedCount} из ${totalCount} упражнений`
            : access
              ? `${access.amateur_completed ? '✓' : '○'} Любители · ${access.beginner_training_completed ? '✓' : '○'} Начальный уровень`
              : 'Заверши начальное обучение и открой любительский режим'}
        </span>
      </span>
      <ChevronRight className="card-chevron" size={20} strokeWidth={2.7} aria-hidden="true" />
    </button>
  );
}

function ExercisePreview({ exercise }: { exercise: AdvancedTrainingCatalogExercise }): JSX.Element {
  return (
    <>
      <img
        className="advanced-training-preview__court"
        src={ADVANCED_COVER}
        alt="Продвинутая хоккейная тренировка"
        draggable={false}
      />
      <span
        className="advanced-training-preview__number"
        aria-label={`Упражнение ${exercise.position}`}
      >
        {exercise.position}
      </span>
    </>
  );
}

function ExerciseStartModal({
  exercise,
  onClose,
  onStart,
}: {
  exercise: AdvancedTrainingCatalogExercise;
  onClose: () => void;
  onStart: () => void;
}): JSX.Element {
  return (
    <AccessibleModal
      title={exercise.title}
      ariaLabel={exercise.title}
      copy={exercise.description}
      onClose={onClose}
      cardClassName="advanced-training-start-modal"
      headerAction={
        <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      }
    >
      <p className="advanced-training-start-modal__goal">
        <strong>Цель:</strong> {exercise.goal}
      </p>
      <button type="button" className="btn btn--cta advanced-training-start-modal__button" onClick={onStart}>
        Начать
      </button>
    </AccessibleModal>
  );
}

export function AdvancedTrainingCatalog({
  catalog,
  onStart,
}: {
  catalog: AdvancedTrainingCatalogModel;
  onStart: (key: AdvancedTrainingExerciseKey) => void;
}): JSX.Element {
  const [selectedExercise, setSelectedExercise] =
    useState<AdvancedTrainingCatalogExercise | null>(null);
  const progressPercent =
    catalog.totalCount > 0 ? (catalog.completedCount / catalog.totalCount) * 100 : 0;

  return (
    <div className="advanced-training-catalog">
      <section className="advanced-training-course-summary" aria-labelledby="advanced-training-progress-title">
        <h2 id="advanced-training-progress-title" className="section-label section-label--page">
          Прогресс
        </h2>
        <div
          className="advanced-training-course-progress"
          role="progressbar"
          aria-label="Прогресс продвинутого обучения"
          aria-valuemin={0}
          aria-valuenow={catalog.completedCount}
          aria-valuemax={catalog.totalCount}
        >
          <span style={{ width: `${progressPercent}%` }} />
          <strong>{catalog.completedCount} / {catalog.totalCount}</strong>
        </div>
      </section>

      <div className="section-label section-label--page">Упражнения ({catalog.totalCount})</div>
      <div className="advanced-training-exercise-list">
        {catalog.exercises.map((exercise) => {
          const locked = exercise.state === 'locked';
          const completed = exercise.state === 'completed';
          const statusText = completed ? 'Пройдено' : locked ? 'Закрыто' : 'Не пройдено';
          const statusClass = completed
            ? 'training-exercise-card__stage--complete'
            : locked
              ? 'training-exercise-card__stage--locked'
              : 'training-exercise-card__stage--available';

          return (
            <article
              key={exercise.key}
              className="achievement-card achievement-card--list"
              aria-label={`Упражнение ${exercise.position}: ${exercise.title}`}
            >
              <button
                type="button"
                className="achievement-card__open advanced-training-exercise-card__open"
                disabled={locked}
                aria-label={`${locked ? 'Недоступно' : completed ? 'Повторить' : 'Начать'}: ${exercise.title}`}
                onClick={() => setSelectedExercise(exercise)}
              >
                <div className="achievement-card__thumbnail advanced-training-preview">
                  <ExercisePreview exercise={exercise} />
                  {completed ? (
                    <span
                      className="achievement-card__status achievement-card__status--claimed advanced-training-exercise-card__completion"
                      aria-label="Упражнение пройдено"
                    >
                      <Check size={12} strokeWidth={3} aria-hidden="true" />
                    </span>
                  ) : null}
                </div>
                <div className="achievement-card__body">
                  <div className="achievement-card__heading">
                    <strong className="achievement-card__title" title={exercise.title}>
                      {exercise.title}
                    </strong>
                    <span className={`achievement-card__stage ${statusClass}`}>{statusText}</span>
                  </div>
                  <span
                    className={`achievement-card__rewards achievement-card__rewards--inline${
                      completed ? ' advanced-training-exercise-card__rewards--claimed' : ''
                    }`}
                    data-testid="advanced-training-reward-slot"
                    aria-label={
                      completed
                        ? 'Награда получена'
                        : `Награда: ${exercise.rewardStars} звезда и ${exercise.rewardExperience} опыт`
                    }
                  >
                    <span style={completed ? undefined : { color: rewardColor('star') }}>
                      <Star
                        size={12}
                        fill="currentColor"
                        data-testid="advanced-training-reward-star"
                        aria-hidden="true"
                      />
                      {exercise.rewardStars}
                    </span>
                    <span style={completed ? undefined : { color: rewardColor('experience') }}>
                      <TrendingUp
                        size={12}
                        data-testid="advanced-training-reward-experience"
                        aria-hidden="true"
                      />
                      {exercise.rewardExperience}
                    </span>
                  </span>
                  {exercise.skill && exercise.goal ? (
                    <div className="advanced-training-exercise-card__meta">
                      <span className="advanced-training-exercise-card__skill">{exercise.skill}</span>
                      <span aria-hidden="true">·</span>
                      <span>Цель: {exercise.goal}</span>
                    </div>
                  ) : null}
                </div>
              </button>
            </article>
          );
        })}
      </div>

      {selectedExercise?.description && selectedExercise.goal ? (
        <ExerciseStartModal
          exercise={selectedExercise}
          onClose={() => setSelectedExercise(null)}
          onStart={() => {
            const key = selectedExercise.key;
            setSelectedExercise(null);
            onStart(key);
          }}
        />
      ) : null}
    </div>
  );
}
