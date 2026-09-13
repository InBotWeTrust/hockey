import { highestCompletedLevel } from './progressSummary.js';

interface AchievementStage {
  current: number;
  total: number;
  requirement: string;
  progressValue: number;
  targetValue: number;
  history: Array<{ stageNumber: number }>;
}

function completedLevelCount(
  stage: AchievementStage,
  status: 'locked' | 'completed_unclaimed' | 'claimed' | undefined,
): number {
  return status === 'claimed' && stage.current >= stage.total
    ? stage.total
    : highestCompletedLevel({ stage, ...(status === undefined ? {} : { status }) });
}

export function AchievementLevelBadge({
  stage,
  status,
}: {
  stage: AchievementStage;
  status: 'locked' | 'completed_unclaimed' | 'claimed' | undefined;
}): JSX.Element {
  return (
    <span className="achievement-details-modal__level">
      Текущий уровень — {completedLevelCount(stage, status)}/{stage.total}
    </span>
  );
}

export function AchievementStageDetails({
  stage,
}: {
  stage: AchievementStage;
  status: 'locked' | 'completed_unclaimed' | 'claimed' | undefined;
}): JSX.Element {
  const progressPercent =
    stage.targetValue > 0
      ? Math.min(100, Math.max(0, (stage.progressValue / stage.targetValue) * 100))
      : 0;
  const formatNumber = (value: number): string =>
    new Intl.NumberFormat('ru-RU').format(value).replaceAll('\u00a0', ' ');

  return (
    <div className="achievement-stage-details">
      <div className="achievement-stage-details__current">
        <strong>Задание для уровня {stage.current}</strong>
        <span>{stage.requirement}</span>
      </div>

      {stage.targetValue > 0 && (
        <div
          className="achievement-card__stage-progress"
          role="progressbar"
          aria-label="Прогресс текущего уровня"
          aria-valuemin={0}
          aria-valuenow={stage.progressValue}
          aria-valuemax={stage.targetValue}
        >
          <div
            className="achievement-card__stage-progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
          <strong>
            {formatNumber(stage.progressValue)} / {formatNumber(stage.targetValue)}
          </strong>
        </div>
      )}

    </div>
  );
}
