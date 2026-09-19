import { Check, ChevronRight, Lock, RotateCcw, Star } from 'lucide-react';
import type {
  InitialTrainingCatalogResponse,
  InitialTrainingExercise,
  InitialTrainingExerciseKey,
  InitialTrainingFeedbackCode,
} from '../api/initialTraining.js';

const exerciseSkill: Record<InitialTrainingExerciseKey, string> = {
  'first-shot': 'Точность броска',
  'three-positions': 'Выбор позиции',
  'follow-the-goal': 'Наблюдение',
  'moving-goal': 'Тайминг',
  'find-the-gap': 'Чтение вратаря',
};

export function initialTrainingFeedbackCopy(code: InitialTrainingFeedbackCode): string {
  if (code === 'miss_left') return 'Возьми чуть левее — ворота были левее броска.';
  if (code === 'miss_right') return 'Возьми чуть правее — ворота были правее броска.';
  if (code === 'goalie_blocked') return 'Этот угол перекрыл вратарь. Дождись свободной стороны.';
  return 'Точный тайминг — продолжай в том же ритме!';
}

function ProgressSegments({ catalog }: { catalog: InitialTrainingCatalogResponse }): JSX.Element {
  return (
    <ol className="initial-training-progress" aria-label="Прогресс начального обучения">
      {Array.from({ length: catalog.total_count }, (_, index) => (
        <li
          key={index}
          className={index < catalog.completed_count ? 'is-complete' : undefined}
          aria-label={
            index < catalog.completed_count
              ? `Упражнение ${index + 1} завершено`
              : `Упражнение ${index + 1} не завершено`
          }
        />
      ))}
    </ol>
  );
}

export function InitialTrainingHub({
  catalog,
  onOpenCourse,
  onOpenTraining,
}: {
  catalog: InitialTrainingCatalogResponse;
  onOpenCourse: () => void;
  onOpenTraining: () => void;
}): JSX.Element {
  return (
    <div className="initial-training-hub">
      <button
        type="button"
        className="initial-training-mode-card initial-training-mode-card--course"
        onClick={onOpenCourse}
        aria-label={`Начальное обучение, пройдено ${catalog.completed_count} из ${catalog.total_count}`}
      >
        <img src="/sprites/training-court.webp" alt="Дворовая площадка" draggable={false} />
        <span className="initial-training-mode-card__shade" />
        <span className="initial-training-mode-card__content">
          <span className="initial-training-mode-card__eyebrow">Курс из 5 упражнений</span>
          <strong>Начальное обучение</strong>
          <span>Освой точность, движение ворот и игру против вратаря.</span>
          <span className="initial-training-mode-card__progress-row">
            <ProgressSegments catalog={catalog} />
            <b>{catalog.completed_count} из {catalog.total_count}</b>
          </span>
        </span>
        <ChevronRight className="initial-training-mode-card__chevron" aria-hidden="true" />
      </button>

      <button
        type="button"
        className="initial-training-mode-card initial-training-mode-card--open"
        disabled={!catalog.open_training_unlocked}
        onClick={onOpenTraining}
        aria-label="Открытая тренировка"
      >
        <img src="/modes/training-evening.webp" alt="Открытая тренировка" draggable={false} />
        <span className="initial-training-mode-card__shade" />
        <span className="initial-training-mode-card__content">
          <span className="initial-training-mode-card__eyebrow">Свободный режим</span>
          <strong>Открытая тренировка</strong>
          <span>Настрой период, тренируйся в своём темпе и следи за историей.</span>
          {!catalog.open_training_unlocked && (
            <span className="initial-training-mode-card__lock-copy">
              <Lock size={15} aria-hidden="true" />
              Пройдите все 5 упражнений: {catalog.completed_count} из {catalog.total_count}
            </span>
          )}
        </span>
        {catalog.open_training_unlocked ? (
          <ChevronRight className="initial-training-mode-card__chevron" aria-hidden="true" />
        ) : (
          <Lock className="initial-training-mode-card__chevron" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

function ExercisePreview({ exercise }: { exercise: InitialTrainingExercise }): JSX.Element {
  const hasGoalie = exercise.key === 'find-the-gap';
  return (
    <div className={`initial-training-preview initial-training-preview--${exercise.key}`}>
      <img
        className="initial-training-preview__court"
        src="/sprites/training-court.webp"
        alt="Дворовая сцена упражнения"
        draggable={false}
      />
      <img
        className="initial-training-preview__goal"
        src="/sprites/test-goal-clean.webp"
        alt="Ворота"
        draggable={false}
      />
      {hasGoalie && (
        <img
          className="initial-training-preview__goalie"
          src="/sprites/training-goalie-amateur.webp"
          alt="Дворовой вратарь"
          draggable={false}
        />
      )}
      <img
        className="initial-training-preview__player"
        src="/sprites/street-player-left.webp"
        alt="Дворовой игрок"
        draggable={false}
      />
    </div>
  );
}

export function InitialTrainingCatalog({
  catalog,
  onStart,
}: {
  catalog: InitialTrainingCatalogResponse;
  onStart: (key: InitialTrainingExerciseKey) => void;
}): JSX.Element {
  return (
    <div className="initial-training-catalog">
      <div className="initial-training-course-summary">
        <ProgressSegments catalog={catalog} />
        <strong>{catalog.completed_count} из {catalog.total_count}</strong>
      </div>
      <div className="section-label section-label--page">Упражнения</div>
      <div className="initial-training-exercise-list">
        {catalog.exercises.map((exercise) => {
          const locked = exercise.state === 'locked';
          const completed = exercise.state === 'completed';
          return (
            <article
              key={exercise.key}
              className={`initial-training-exercise-card initial-training-exercise-card--${exercise.state}`}
              aria-label={`Упражнение ${exercise.position}: ${exercise.title}`}
            >
              <ExercisePreview exercise={exercise} />
              <div className="initial-training-exercise-card__body">
                <div className="initial-training-exercise-card__meta">
                  <span>Упражнение {exercise.position}</span>
                  <span>{exerciseSkill[exercise.key]}</span>
                </div>
                <h2>{exercise.title}</h2>
                <p>{exercise.description}</p>
                <div className="initial-training-exercise-card__goal">
                  Цель: {exercise.targetGoals} успешных голов
                </div>
                <div className="initial-training-exercise-card__footer">
                  <span className="initial-training-exercise-card__reward">
                    <Star size={15} aria-hidden="true" />
                    {completed
                      ? 'Повтор без награды'
                      : `${exercise.rewardStars} звезда + ${exercise.rewardExperience} опыт`}
                  </span>
                  <button
                    type="button"
                    className="btn btn--cta initial-training-exercise-card__action"
                    disabled={locked}
                    aria-label={`${locked ? 'Недоступно' : completed ? 'Повторить' : 'Начать'}: ${exercise.title}`}
                    onClick={() => onStart(exercise.key)}
                  >
                    {locked ? <Lock size={16} aria-hidden="true" /> : completed ? <RotateCcw size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
                    {locked ? 'Закрыто' : completed ? 'Повторить' : 'Начать'}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
