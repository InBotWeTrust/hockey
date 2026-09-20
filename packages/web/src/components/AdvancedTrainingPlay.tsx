import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolvePerspectiveCourtShot, type ShotResult } from '@hockey/game-core';
import {
  restartAdvancedTrainingPractice,
  startAdvancedTrainingAssessment,
  startAdvancedTrainingExercise,
  submitAdvancedTrainingShot,
  type AdvancedTrainingRunState,
} from '../api/advancedTraining.js';
import type { AdvancedTrainingScenario } from '@hockey/game-core';
import {
  PlayView,
  TRAINING_AMATEUR_GOALIE_OPTIONS,
  TRAINING_COURSE_GOAL_OPTIONS,
  TRAINING_STREET_PLAYER_OPTIONS,
  type PlayShotResolver,
} from '../game/PlayView.js';
import { TRAINING_LONG_COURT_BACKGROUND } from '../game/trainingNewCourt.js';
import { AccessibleModal } from './AccessibleModal.js';
import {
  advancedTrainingFeedbackCopy,
  advancedTrainingFeedbackTone,
  type AdvancedTrainingExerciseKey,
} from './AdvancedTrainingCourse.js';

const EXERCISE_POSITION: Record<AdvancedTrainingExerciseKey, number> = {
  'board-side': 1,
  'open-net': 2,
  crossing: 3,
  'goalie-leaving': 4,
  'narrow-gap': 5,
  'counter-direction': 6,
  'second-tempo': 7,
  'rhythm-reset': 8,
};

export function AdvancedTrainingPlay({
  exerciseKey,
  onBack,
  onCourse,
  onCatalogRefresh,
}: {
  exerciseKey: AdvancedTrainingExerciseKey;
  onBack: () => void;
  onCourse: () => void;
  onCatalogRefresh: (key: AdvancedTrainingExerciseKey) => void;
}): JSX.Element {
  const [run, setRun] = useState<AdvancedTrainingRunState | null>(null);
  const [demonstrationScenarios, setDemonstrationScenarios] = useState<AdvancedTrainingScenario[]>([]);
  const [demonstrationIndex, setDemonstrationIndex] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<ReturnType<typeof advancedTrainingFeedbackCopy> | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'success' | 'error'>('success');
  const [error, setError] = useState<string | null>(null);
  const [stageFinished, setStageFinished] = useState(false);
  const [result, setResult] = useState<{
    passed: boolean;
    reward: { stars: number; experience: number } | null;
  } | null>(null);
  const pendingStageFinishRef = useRef(false);
  const resultAnimationCompleteRef = useRef(false);
  const feedbackTimerRef = useRef<number | null>(null);
  const startRequestRef = useRef<{
    exerciseKey: AdvancedTrainingExerciseKey;
    request: ReturnType<typeof startAdvancedTrainingExercise>;
  } | null>(null);

  const clearFeedback = useCallback(() => {
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = null;
    setFeedback(null);
  }, []);

  useEffect(() => {
    let active = true;
    if (startRequestRef.current?.exerciseKey !== exerciseKey) {
      startRequestRef.current = { exerciseKey, request: startAdvancedTrainingExercise(exerciseKey) };
    }
    void startRequestRef.current.request
      .then((response) => {
        if (!active) return;
        setRun(response.state);
        setDemonstrationScenarios(response.demonstrations);
        setDemonstrationIndex(response.demonstrations.length > 0 ? 0 : null);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Не удалось начать упражнение');
      });
    return () => {
      active = false;
      if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    };
  }, [exerciseKey]);

  const speedOverrides = useMemo(
    () =>
      run
        ? {
            shooterFreq: run.scene.speeds.shooter_frequency,
            goalieFreq: run.scene.speeds.goalie_frequency,
            goalFreq: run.scene.speeds.goal_frequency,
            puckSpeed: run.scene.speeds.puck_speed_per_ms,
          }
        : undefined,
    [run],
  );
  const demonstrationScenario = demonstrationIndex === null
    ? null
    : (demonstrationScenarios[demonstrationIndex] ?? null);
  const isDemonstrating = demonstrationScenario !== null;

  const applyState = useCallback((state: AdvancedTrainingRunState) => setRun(state), []);
  const optimisticAddShot = useCallback(() => {
    resultAnimationCompleteRef.current = false;
    setRun((current) => current ? { ...current, shots_taken: current.shots_taken + 1 } : current);
  }, []);

  const submitShot = useCallback(
    async ({ shotIndex, input, claimedResult }: { shotIndex: number; input: Parameters<PlayShotResolver>[0]['input']; claimedResult: ShotResult['type'] }) => {
      if (!run) return null;
      if (isDemonstrating) {
        return { serverResult: claimedResult, state: run, isCurrent: () => true };
      }
      try {
        const response = await submitAdvancedTrainingShot(exerciseKey, {
          run_id: run.run_id,
          shot_index: shotIndex,
          input: { tapTime: input.tapTime, ...(input.shooterTapTime === undefined ? {} : { shooterTapTime: input.shooterTapTime }) },
          claimed_result: claimedResult,
        });
        clearFeedback();
        setFeedback(advancedTrainingFeedbackCopy(response.feedback_code));
        setFeedbackTone(advancedTrainingFeedbackTone(response.feedback_code));
        feedbackTimerRef.current = window.setTimeout(clearFeedback, 3_500);
        if (response.stage_finished) {
          pendingStageFinishRef.current = true;
          if (response.state.stage === 'assessment' || response.passed !== null) {
            const nextResult = { passed: response.passed === true, reward: response.reward_granted };
            setResult(nextResult);
            if (response.completed) onCatalogRefresh(exerciseKey);
          }
          if (resultAnimationCompleteRef.current) setStageFinished(true);
        }
        return { serverResult: response.server_result, state: response.state, isCurrent: () => true };
      } catch (cause) {
        setRun((current) => current ? { ...current, shots_taken: Math.max(0, current.shots_taken - 1) } : current);
        setError(cause instanceof Error ? cause.message : 'Не удалось выполнить запрос');
        return null;
      }
    },
    [clearFeedback, exerciseKey, isDemonstrating, onCatalogRefresh, run],
  );

  if (!run || !speedOverrides) {
    return (
      <main className="screen initial-training-play-state" role={error ? 'alert' : undefined}>
        {error ?? 'Готовим упражнение…'}
        {error ? <button type="button" className="btn btn--ghost" onClick={onCourse}>К упражнениям</button> : null}
      </main>
    );
  }

  const showModal = stageFinished;
  const shotResolver: PlayShotResolver = (context) =>
    resolvePerspectiveCourtShot(
      context.input,
      context.goalieConfig,
      context.seed,
      context.shotIndex,
      context.stickEffects,
      context.phaseOffsets,
    );

  return (
    <>
      <PlayView<AdvancedTrainingRunState>
        suppressedByModal={showModal}
        showIceCar={false}
        onBack={onBack}
        active={!showModal}
        seed={isDemonstrating ? `${run.seed}:demonstration:${demonstrationIndex}` : run.seed}
        goalieId={run.scene.goalie_id}
        goalieConfig={run.scene.goalie_config}
        periodNumber={1}
        periodLabel="УПРАЖНЕНИЯ"
        scoreboardPeriodNumber={EXERCISE_POSITION[exerciseKey]}
        scoreboardPeriodsTotal={8}
        speedOverrides={speedOverrides}
        sessionStartedAt={run.started_at}
        serverNow={run.server_now}
        goals={run.successes}
        scoreLabel="ПРИЁМЫ"
        shots={run.shots_taken}
        timer={`${isDemonstrating ? 0 : Math.min(run.situation_index + 1, run.total_situations)}/${run.total_situations}`}
        timerLabel="МОМЕНТЫ"
        shotButtonLabel={isDemonstrating ? 'ПОКАЗ' : 'БРОСОК'}
        primaryActionBlocked={isDemonstrating}
        backLabel="К упражнениям"
        optimisticAddShot={isDemonstrating ? () => undefined : optimisticAddShot}
        submitShot={submitShot}
        applyState={applyState}
        longCourtBackground={TRAINING_LONG_COURT_BACKGROUND}
        playerOptions={TRAINING_STREET_PLAYER_OPTIONS}
        goalOptions={TRAINING_COURSE_GOAL_OPTIONS}
        goalieOptions={TRAINING_AMATEUR_GOALIE_OPTIONS}
        shotResolver={shotResolver}
        resultCopy={{ goal: 'ГОЛ', save: 'СЭЙВ', miss: 'МИМО' }}
        statusNotice={isDemonstrating
          ? `Показ ${Number(demonstrationIndex) + 1} из ${demonstrationScenarios.length}: следи за траекторией броска у борта`
          : (feedback ?? error)}
        statusNoticeTone={feedback ? feedbackTone : 'error'}
        statusNoticeDelayMs={500}
        autoShotDelayMs={demonstrationScenario?.targetTapTimeMs}
        clockRebaseKey={isDemonstrating ? `advanced-demonstration-${demonstrationIndex}` : undefined}
        initialSceneElapsedMs={isDemonstrating ? 0 : undefined}
        initialShooterElapsedMs={isDemonstrating ? 0 : undefined}
        onResultComplete={() => {
          if (isDemonstrating) {
            setDemonstrationIndex((current) => {
              if (current === null || current + 1 >= demonstrationScenarios.length) return null;
              return current + 1;
            });
            return;
          }
          resultAnimationCompleteRef.current = true;
          if (pendingStageFinishRef.current) setStageFinished(true);
        }}
      />

      <AccessibleModal
        open={stageFinished}
        title={run.stage === 'practice' ? 'Практика завершена' : result?.passed ? 'Упражнение пройдено' : 'Зачёт не пройден'}
        onRequestClose={onCourse}
      >
        <p className="modal-copy">
          {run.stage === 'practice'
            ? `Успешно: ${run.successes} из ${run.total_situations}. Теперь результат пойдёт в зачёт.`
            : `Результат: ${run.successes} из ${run.total_situations}. Для прохождения нужно 7.`}
        </p>
        <div className="modal-actions">
          {run.stage === 'practice' ? (
            <button
              type="button"
              className="modal-primary btn btn--cta"
              onClick={() => void startAdvancedTrainingAssessment(exerciseKey, run.run_id).then(({ state }) => {
                pendingStageFinishRef.current = false;
                resultAnimationCompleteRef.current = false;
                setRun(state);
                setStageFinished(false);
              })}
            >
              Начать зачёт
            </button>
          ) : result?.passed ? (
            <button type="button" className="modal-primary btn btn--cta" onClick={onCourse}>К упражнениям</button>
          ) : (
            <button
              type="button"
              className="modal-primary btn btn--cta"
              onClick={() => void startAdvancedTrainingExercise(exerciseKey).then((response) => {
                pendingStageFinishRef.current = false;
                resultAnimationCompleteRef.current = false;
                setRun(response.state);
                setDemonstrationScenarios(response.demonstrations);
                setDemonstrationIndex(response.demonstrations.length > 0 ? 0 : null);
                setStageFinished(false);
                setResult(null);
              })}
            >
              Повторить
            </button>
          )}
          {run.stage === 'practice' ? (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => void restartAdvancedTrainingPractice(exerciseKey, run.run_id).then(({ state }) => {
                setRun(state);
                setStageFinished(false);
              })}
            >
              Повторить практику
            </button>
          ) : null}
        </div>
      </AccessibleModal>
    </>
  );
}
