import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  resolveEmptyGoalShot,
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
  TRAINING_STREET_PLAYER_OPTIONS,
  type PlayShotResolver,
} from '../game/PlayView.js';
import { TRAINING_LONG_COURT_BACKGROUND } from '../game/trainingNewCourt.js';
import { initialTrainingFeedbackCopy } from './InitialTrainingCourse.js';

export function resolveInitialTrainingClientShot(
  hasGoalie: boolean,
  context: Parameters<PlayShotResolver>[0],
): ShotResult {
  if (!hasGoalie) {
    return resolveEmptyGoalShot(context.input, context.goalieConfig, context.phaseOffsets);
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
  const isFinal = exercisePosition === 5;
  return (
    <div className="modal-backdrop initial-training-result-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Упражнение завершено"
        className="modal-card initial-training-result"
      >
        <div className="initial-training-result__mark" aria-hidden="true">✓</div>
        <h2>Упражнение завершено</h2>
        <p>
          {reward
            ? `+${reward.stars} звезда · +${reward.experience} опыт`
            : 'Повтор завершён без награды'}
        </p>
        <div className="initial-training-result__actions">
          <button type="button" className="btn btn--cta" onClick={isFinal ? onOpenTraining : onNext}>
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
  onCatalogRefresh: () => void;
}): JSX.Element {
  const [run, setRun] = useState<InitialTrainingRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<InitialTrainingFeedbackCode | null>(null);
  const [completion, setCompletion] = useState<{
    reward: { stars: number; experience: number } | null;
  } | null>(null);
  const [showResult, setShowResult] = useState(false);
  const completionRef = useRef(completion);
  completionRef.current = completion;
  const resultAnimationCompleteRef = useRef(false);

  useEffect(() => {
    let active = true;
    setRun(null);
    setError(null);
    setFeedback(null);
    setCompletion(null);
    setShowResult(false);
    void startInitialTrainingExercise(exerciseKey)
      .then((next) => {
        if (active) setRun(next);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Не удалось начать упражнение');
      });
    return () => {
      active = false;
    };
  }, [exerciseKey]);

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
        setFeedback(response.feedback_code);
        if (response.completed) {
          const nextCompletion = { reward: response.reward_granted };
          completionRef.current = nextCompletion;
          setCompletion(nextCompletion);
          onCatalogRefresh();
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
    [exerciseKey, onCatalogRefresh, run],
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
        suppressedByModal={showResult}
        showIceCar={false}
        onBack={onBack}
        active={!completion}
        seed={run.seed}
        goalieId={run.scene.goalie_id}
        goalieConfig={run.scene.goalie_config}
        periodNumber={1}
        scoreboardPeriodNumber={run.exercise.position}
        scoreboardPeriodsTotal={5}
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
        goalieOptions={TRAINING_AMATEUR_GOALIE_OPTIONS}
        hideGoalie={!run.scene.has_goalie}
        shotResolver={shotResolver}
        resultCopy={{
          goal: 'Гол подтверждён',
          save: 'Вратарь отбил',
          miss: 'Бросок мимо',
        }}
        hudAddon={
          <div className="initial-training-play-hud">
            <span>Уровень {run.exercise.position} из 5</span>
            <strong>{run.exercise.title}</strong>
            <b>{run.goals}/{run.target_goals} голов</b>
            {feedback && <em role="status">{initialTrainingFeedbackCopy(feedback)}</em>}
            {error && <em role="alert">{error}</em>}
          </div>
        }
        onResultComplete={() => {
          resultAnimationCompleteRef.current = true;
          if (completionRef.current) setShowResult(true);
        }}
      />
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
