import { Check, ChevronRight, Star, TrendingUp } from 'lucide-react';
import { rewardColor } from '../app/rewardColors.js';
import type {
  InitialTrainingCatalogResponse,
  InitialTrainingExercise,
  InitialTrainingExerciseKey,
  InitialTrainingFeedbackCode,
} from '../api/initialTraining.js';
import { AdvancedTrainingHubCard } from './AdvancedTrainingCourse.js';

const exerciseSkill: Record<InitialTrainingExerciseKey, string> = {
  'first-shot': 'Точность',
  'three-positions': 'Позиция',
  'follow-the-goal': 'Фокус',
  'moving-goal': 'Тайминг',
  'find-the-gap': 'Угол',
};

export function initialTrainingFeedbackCopy(code: InitialTrainingFeedbackCode): string {
  if (code === 'miss_left') return 'Возьми чуть правее — бросок прошёл левее ворот.';
  if (code === 'miss_right') return 'Возьми чуть левее — бросок прошёл правее ворот.';
  if (code === 'goalie_blocked') return 'Этот угол перекрыл вратарь. Дождись свободной стороны.';
  return 'Точный тайминг — продолжай в том же ритме!';
}

export function InitialTrainingHub({
  catalog,
  onOpenCourse,
  onOpenTraining,
  onOpenAdvanced,
}: {
  catalog: InitialTrainingCatalogResponse;
  onOpenCourse: () => void;
  onOpenTraining: () => void;
  onOpenAdvanced: () => void;
}): JSX.Element {
  const advanced = catalog.advanced_training;
  return (
    <div className="initial-training-hub">
      <button
        type="button"
        className="section-card-surface amateur-hub-card initial-training-mode-card"
        onClick={onOpenCourse}
        aria-label={`Начальный уровень, пройдено ${catalog.completed_count} из ${catalog.total_count} упражнений`}
      >
        <span className="amateur-hub-card__art" aria-hidden="true">
          <img src="/sprites/initial-training-course-cover.webp" alt="" draggable={false} />
        </span>
        <span className="amateur-hub-card__copy">
          <strong>Начальный уровень</strong>
          <span>{catalog.completed_count} из {catalog.total_count} упражнений</span>
        </span>
        <ChevronRight className="card-chevron" size={20} strokeWidth={2.7} aria-hidden="true" />
      </button>

      <AdvancedTrainingHubCard
        completedCount={advanced.completed_count}
        totalCount={advanced.total_count}
        unlocked={advanced.enabled && advanced.access.unlocked}
        access={advanced.access}
        onOpen={onOpenAdvanced}
      />

      <button
        type="button"
        className="section-card-surface amateur-hub-card initial-training-mode-card initial-training-mode-card--open"
        disabled={!catalog.open_training_unlocked}
        onClick={onOpenTraining}
        aria-label="Открытая тренировка"
      >
        <span className="amateur-hub-card__art" aria-hidden="true">
          <img src="/modes/training-evening.webp" alt="" draggable={false} />
        </span>
        <span className="amateur-hub-card__copy">
          <strong>Открытая тренировка</strong>
          <span>
            {catalog.open_training_unlocked
              ? 'Свободный режим и история тренировок'
              : `Откроется после ${catalog.total_count} упражнений`}
          </span>
        </span>
        <ChevronRight className="card-chevron" size={20} strokeWidth={2.7} aria-hidden="true" />
      </button>
    </div>
  );
}

function ExercisePreview({ exercise }: { exercise: InitialTrainingExercise }): JSX.Element {
  return (
    <>
      <img
        className="initial-training-preview__court"
        src="/sprites/initial-training-course-cover.webp"
        alt="Дворовая сцена упражнения"
        draggable={false}
      />
      <span className="initial-training-preview__number" aria-label={`Упражнение ${exercise.position}`}>
        {exercise.position}
      </span>
    </>
  );
}

export function InitialTrainingCatalog({
  catalog,
  onStart,
}: {
  catalog: InitialTrainingCatalogResponse;
  onStart: (key: InitialTrainingExerciseKey) => void;
}): JSX.Element {
  const progressPercent =
    catalog.total_count > 0 ? (catalog.completed_count / catalog.total_count) * 100 : 0;

  const renderExercise = (exercise: InitialTrainingExercise) => {
    const locked = exercise.state === 'locked';
    const completed = exercise.state === 'completed';
    const statusClass = completed
      ? 'training-exercise-card__stage--complete'
      : locked
        ? 'training-exercise-card__stage--locked'
        : 'training-exercise-card__stage--available';
    const statusText = completed ? 'Пройдено' : locked ? 'Закрыто' : 'Не пройдено';
    return (
      <article
        key={exercise.key}
        className="achievement-card achievement-card--list"
        aria-label={`Упражнение ${exercise.position}: ${exercise.title}`}
      >
        <button
          type="button"
          className="achievement-card__open"
          disabled={locked}
          aria-label={`${locked ? 'Недоступно' : completed ? 'Повторить' : 'Начать'}: ${exercise.title}`}
          onClick={() => onStart(exercise.key)}
        >
          <div className="achievement-card__thumbnail initial-training-preview">
            <ExercisePreview exercise={exercise} />
            {completed ? (
              <span
                className="achievement-card__status achievement-card__status--claimed initial-training-exercise-card__completion"
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
              <span
                className={`achievement-card__stage initial-training-exercise-card__stage ${statusClass}`}
              >
                {statusText}
              </span>
            </div>
            <span
              className={`achievement-card__rewards achievement-card__rewards--inline${
                completed ? ' initial-training-exercise-card__rewards--claimed' : ''
              }`}
              data-testid="initial-training-reward-slot"
              aria-label={
                completed
                  ? 'Награда получена'
                  : `Награда: ${exercise.rewardStars} звезда и ${exercise.rewardExperience} опыт`
              }
            >
              <span style={completed ? undefined : { color: rewardColor('star') }}>
                <Star size={12} fill="currentColor" data-testid="initial-training-reward-star" aria-hidden="true" />
                {exercise.rewardStars}
              </span>
              <span style={completed ? undefined : { color: rewardColor('experience') }}>
                <TrendingUp size={12} data-testid="initial-training-reward-experience" aria-hidden="true" />
                {exercise.rewardExperience}
              </span>
            </span>
            <div className="initial-training-exercise-card__meta">
              <span className="initial-training-exercise-card__skill">{exerciseSkill[exercise.key]}</span>
              <span aria-hidden="true">·</span>
              <span>Цель: {exercise.targetGoals} забитых шайб</span>
            </div>
          </div>
        </button>
      </article>
    );
  };

  return (
    <div className="initial-training-catalog">
      <section className="initial-training-course-summary" aria-labelledby="initial-training-progress-title">
        <h2 id="initial-training-progress-title" className="section-label section-label--page">
          Прогресс
        </h2>
        <div
          className="initial-training-course-progress"
          role="progressbar"
          aria-label="Прогресс начального обучения"
          aria-valuemin={0}
          aria-valuenow={catalog.completed_count}
          aria-valuemax={catalog.total_count}
        >
          <span style={{ width: `${progressPercent}%` }} />
          <strong>{catalog.completed_count} / {catalog.total_count}</strong>
        </div>
      </section>
      <div className="section-label section-label--page">Упражнения</div>
      <div className="initial-training-exercise-list">
        {catalog.exercises.map(renderExercise)}
      </div>
    </div>
  );
}
