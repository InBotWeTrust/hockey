import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Star, TrendingUp } from 'lucide-react';
import {
  resolvePerspectiveCourtEmptyGoalShot,
  resolvePerspectiveCourtShot,
  type ShotResult,
} from '@hockey/game-core';
import {
  startInitialTrainingExercise,
  submitInitialTrainingShot,
  type InitialTrainingExerciseKey,
  type InitialTrainingFeedbackCode,
  type InitialTrainingRun,
  type InitialTrainingShotState,
} from '../api/initialTraining.js';
import {
  PlayView,
  TRAINING_AMATEUR_GOALIE_OPTIONS,
  TRAINING_COURSE_GOAL_OPTIONS,
  TRAINING_STREET_PLAYER_OPTIONS,
  type PlayShotResolver,
} from '../game/PlayView.js';
import { TRAINING_LONG_COURT_BACKGROUND } from '../game/trainingNewCourt.js';
import { rewardColor } from '../app/rewardColors.js';
import { AccessibleModal } from './AccessibleModal.js';
import { initialTrainingFeedbackCopy } from './InitialTrainingCourse.js';

export function resolveInitialTrainingClientShot(
  hasGoalie: boolean,
  context: Parameters<PlayShotResolver>[0],
): ShotResult {
  if (!hasGoalie) {
    return resolvePerspectiveCourtEmptyGoalShot(
      context.input,
      context.goalieConfig,
      context.phaseOffsets,
    );
  }
  return resolvePerspectiveCourtShot(
    context.input,
    context.goalieConfig,
    context.seed,
    context.shotIndex,
    context.stickEffects,
    context.phaseOffsets,
  );
}

export function InitialTrainingResult({
  exercisePosition,
  reward,
  onNext,
  onCourse,
  onOpenTraining,
}: {
  exercisePosition: number;
  reward: { stars: number; experience: number } | null;
  onNext: () => void;
  onCourse: () => void;
  onOpenTraining: () => void;
}): JSX.Element {
  const isFinal = exercisePosition === 7;
  return (
    <div className="modal-backdrop initial-training-result-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Упражнение завершено"
        className="modal-card duel-result-card initial-training-result"
      >
        <div className="section-label" style={{ margin: 0, padding: 0 }}>
          Результат
        </div>
        <h2 className="modal-title">Упражнение завершено</h2>
        {reward ? (
          <div className="initial-training-result__rewards" aria-label="Полученная награда">
            <span aria-label={`Звёзды: +${reward.stars}`} style={{ color: rewardColor('star') }}>
              <Star data-testid="initial-training-result-star" fill="currentColor" aria-hidden="true" />
              +{reward.stars}
            </span>
            <span aria-label={`Опыт: +${reward.experience}`} style={{ color: rewardColor('experience') }}>
              <TrendingUp data-testid="initial-training-result-experience" aria-hidden="true" />
              +{reward.experience}
            </span>
          </div>
        ) : (
          <p className="modal-copy">Повтор завершён без награды</p>
        )}
        <div className="modal-actions">
          <button type="button" className="modal-primary btn btn--cta" onClick={isFinal ? onOpenTraining : onNext}>
            {isFinal ? 'В открытую тренировку' : 'Следующий уровень'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCourse}>
            К упражнениям
          </button>
        </div>
      </section>
    </div>
  );
}

export function InitialTrainingPlay({
  exerciseKey,
  onBack,
  onNext,
  onCourse,
  onOpenTraining,
  onCatalogRefresh,
}: {
  exerciseKey: InitialTrainingExerciseKey;
  onBack: () => void;
  onNext: () => void;
  onCourse: () => void;
  onOpenTraining: () => void;
  onCatalogRefresh: (completedKey: InitialTrainingExerciseKey) => void;
}): JSX.Element {
  const [run, setRun] = useState<InitialTrainingRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<InitialTrainingFeedbackCode | null>(null);
  const [completion, setCompletion] = useState<{
    reward: { stars: number; experience: number } | null;
  } | null>(null);
  const [showBriefing, setShowBriefing] = useState(true);
  const [showResult, setShowResult] = useState(false);
  const completionRef = useRef(completion);
  completionRef.current = completion;
  const resultAnimationCompleteRef = useRef(false);
  const feedbackTimerRef = useRef<number | null>(null);
  const startRequestRef = useRef<{
    exerciseKey: InitialTrainingExerciseKey;
    request: ReturnType<typeof startInitialTrainingExercise>;
  } | null>(null);

  const clearFeedback = useCallback(() => {
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
    setFeedback(null);
  }, []);

  useEffect(
    () => () => {
      if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    let active = true;
    setRun(null);
    setError(null);
    clearFeedback();
    setCompletion(null);
    setShowBriefing(true);
    setShowResult(false);
    if (startRequestRef.current?.exerciseKey !== exerciseKey) {
      startRequestRef.current = {
        exerciseKey,
        request: startInitialTrainingExercise(exerciseKey),
      };
    }
    void startRequestRef.current.request
      .then((next) => {
        if (active) setRun(next);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Не удалось начать упражнение');
      });
    return () => {
      active = false;
    };
  }, [clearFeedback, exerciseKey]);

  const speedOverrides = useMemo(() => {
    if (!run) return undefined;
    return {
      shooterFreq: run.scene.speeds.shooter_frequency,
      goalieFreq: run.scene.speeds.goalie_frequency,
      goalFreq: run.scene.speeds.goal_frequency,
      puckSpeed: run.scene.speeds.puck_speed_per_ms,
    };
  }, [run]);

  const optimisticAddShot = useCallback((claimed: ShotResult['type']) => {
    resultAnimationCompleteRef.current = false;
    setRun((current) =>
      current
        ? {
            ...current,
            shots_taken: current.shots_taken + 1,
            goals: current.goals + (claimed === 'goal' ? 1 : 0),
          }
        : current,
    );
  }, []);

  const applyShotState = useCallback((next: InitialTrainingShotState) => {
    setRun((current) =>
      current
        ? {
            ...current,
            shots_taken: next.shots_taken,
            goals: next.goals,
            target_goals: next.target_goals,
            scene: next.scene,
          }
        : current,
    );
  }, []);

  const submitShot = useCallback(
    async ({
      shotIndex,
      input,
      claimedResult,
    }: {
      shotIndex: number;
      input: Parameters<typeof submitInitialTrainingShot>[1]['input'];
      claimedResult: ShotResult['type'];
    }) => {
      if (!run) return null;
      try {
        const response = await submitInitialTrainingShot(exerciseKey, {
          run_id: run.run_id,
          shot_index: shotIndex,
          input,
          claimed_result: claimedResult,
        });
        clearFeedback();
        setFeedback(response.feedback_code);
        feedbackTimerRef.current = window.setTimeout(() => {
          feedbackTimerRef.current = null;
          setFeedback(null);
        }, 3_500);
        if (response.completed) {
          const nextCompletion = { reward: response.reward_granted };
          completionRef.current = nextCompletion;
          setCompletion(nextCompletion);
          onCatalogRefresh(exerciseKey);
          if (resultAnimationCompleteRef.current) setShowResult(true);
        }
        return {
          serverResult: response.server_result,
          state: response.state,
          isCurrent: () => true,
        };
      } catch (cause) {
        setRun((current) =>
          current
            ? {
                ...current,
                shots_taken: Math.max(0, current.shots_taken - 1),
                goals: Math.max(0, current.goals - (claimedResult === 'goal' ? 1 : 0)),
              }
            : current,
        );
        setError(cause instanceof Error ? cause.message : 'Не удалось проверить бросок');
        return null;
      }
    },
    [clearFeedback, exerciseKey, onCatalogRefresh, run],
  );

  if (error && !run) {
    return (
      <main className="screen initial-training-play-state" role="alert">
        <strong>Упражнение не запустилось</strong>
        <span>{error}</span>
        <button type="button" className="btn btn--ghost" onClick={onCourse}>К упражнениям</button>
      </main>
    );
  }
  if (!run || !speedOverrides) {
    return <main className="screen initial-training-play-state">Готовим дворовую площадку…</main>;
  }

  const shotResolver: PlayShotResolver = (context) =>
    resolveInitialTrainingClientShot(run.scene.has_goalie, context);

  return (
    <>
      <PlayView<InitialTrainingShotState>
        suppressedByModal={showBriefing || showResult}
        showIceCar={false}
        onBack={onBack}
        active={!showBriefing && !showResult}
        seed={run.seed}
        goalieId={run.scene.goalie_id}
        goalieConfig={run.scene.goalie_config}
        periodNumber={1}
        periodLabel="УПРАЖНЕНИЕ"
        scoreboardPeriodNumber={run.exercise.position}
        scoreboardPeriodsTotal={7}
        speedOverrides={speedOverrides}
        sessionStartedAt={run.started_at}
        serverNow={run.server_now}
        goals={run.goals}
        shots={run.shots_taken}
        timer={`${run.goals}/${run.target_goals}`}
        timerLabel="ЦЕЛЬ"
        backLabel="К упражнениям"
        optimisticAddShot={optimisticAddShot}
        submitShot={submitShot}
        applyState={applyShotState}
        longCourtBackground={TRAINING_LONG_COURT_BACKGROUND}
        playerOptions={TRAINING_STREET_PLAYER_OPTIONS}
        goalOptions={TRAINING_COURSE_GOAL_OPTIONS}
        goalieOptions={TRAINING_AMATEUR_GOALIE_OPTIONS}
        hideGoalie={!run.scene.has_goalie}
        shotResolver={shotResolver}
        resultCopy={{
          goal: 'ГОЛ',
          save: 'СЭЙВ',
          miss: 'МИМО',
        }}
        statusNotice={feedback ? initialTrainingFeedbackCopy(feedback) : error}
        statusNoticeTone={feedback && feedback !== 'goal_timing' ? 'error' : error ? 'error' : 'success'}
        statusNoticeDelayMs={500}
        onResultComplete={() => {
          resultAnimationCompleteRef.current = true;
          if (completionRef.current) setShowResult(true);
        }}
      />
      <AccessibleModal
        open={showBriefing}
        title={run.exercise.title}
        onRequestClose={onCourse}
        cardClassName="bonus-game-preview-modal initial-training-briefing-modal"
      >
        <p className="modal-copy bonus-game-preview-modal__story">{run.exercise.description}</p>
        <p className="bonus-game-preview-modal__condition">
          Цель: забить {run.target_goals} голов
        </p>
        <div className="modal-actions">
          <button type="button" className="modal-primary btn btn--cta" onClick={() => setShowBriefing(false)}>
            Начать
          </button>
        </div>
      </AccessibleModal>
      {showResult && completion && (
        <InitialTrainingResult
          exercisePosition={run.exercise.position}
          reward={completion.reward}
          onNext={onNext}
          onCourse={onCourse}
          onOpenTraining={onOpenTraining}
        />
      )}
    </>
  );
}
