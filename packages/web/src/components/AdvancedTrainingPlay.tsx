import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GOALIE_Y,
  GOAL_OPENING,
  PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE,
  PERSPECTIVE_COURT_VISUAL_X_CENTER,
  PUCK_START,
  getPerspectiveCourtGoalOpening,
  getSessionPhaseOffsets,
  resolvePerspectiveCourtShot,
  simulateGoalie,
  type ShotResult,
} from '@hockey/game-core';
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

const DEMONSTRATION_COPY: Record<AdvancedTrainingExerciseKey, string> = {
  'board-side': 'Посмотрите, как игрок подъезжает к указанному борту и бросает из крайней позиции.',
  'open-net': 'Посмотрите, как вратарь освобождает створ, а бросок выполняется в пустые ворота.',
  crossing: 'Посмотрите бросок в короткий момент пересечения игрока, ворот и вратаря по центру.',
  'goalie-leaving': 'Посмотрите бросок сразу после того, как вратарь начинает отъезжать от траектории.',
  'narrow-gap': 'Посмотрите точный бросок в небольшой свободный участок ворот рядом с вратарём.',
  'counter-direction': 'Посмотрите бросок в сторону, противоположную движению вратаря.',
  'second-tempo': 'Посмотрите серию из двух или трёх голов подряд за один игровой момент.',
  'rhythm-reset': 'Посмотрите: сначала намеренный промах, затем серия из двух или трёх голов подряд.',
};

type IntroPhase = 'ready' | 'demonstrating' | 'practice-ready' | 'practice';

function demonstrationResult(
  scenario: AdvancedTrainingScenario,
  step: number,
  context: Parameters<PlayShotResolver>[0],
): ShotResult {
  if (scenario.intentionalMissFirst && step === 0) return { type: 'miss', reason: 'wide' };
  const opening = getPerspectiveCourtGoalOpening(
    context.input,
    context.goalieConfig,
    context.phaseOffsets,
  );
  const inset = 8;
  const openingCenter = (opening.xMin + opening.xMax) / 2;
  const puckSpeed = context.input.puckSpeedPerMs ?? 1.2;
  const goalieCrossTime = context.input.tapTime + (PUCK_START.y - GOALIE_Y) / puckSpeed;
  const goalieAtCross = simulateGoalie(
    context.goalieConfig,
    context.seed,
    context.shotIndex,
    goalieCrossTime,
    context.phaseOffsets.goalie,
  ).position.x;
  const goalieBeforeCross = simulateGoalie(
    context.goalieConfig,
    context.seed,
    context.shotIndex,
    goalieCrossTime - 80,
    context.phaseOffsets.goalie,
  ).position.x;
  const goalieMovesRight = goalieAtCross >= goalieBeforeCross;
  const farSideX = goalieAtCross <= openingCenter ? opening.xMax - inset : opening.xMin + inset;
  const counterDirectionX = goalieMovesRight ? opening.xMin + inset : opening.xMax - inset;
  const narrowGapX = goalieAtCross <= openingCenter
    ? Math.min(opening.xMax - inset, goalieAtCross + 42)
    : Math.max(opening.xMin + inset, goalieAtCross - 42);
  const x = scenario.exerciseKey === 'open-net'
    ? farSideX
    : scenario.exerciseKey === 'narrow-gap'
      ? narrowGapX
      : scenario.exerciseKey === 'counter-direction' || scenario.exerciseKey === 'goalie-leaving'
        ? counterDirectionX
        : scenario.requiredSide === 'left'
          ? opening.xMin + inset
          : scenario.requiredSide === 'right'
            ? opening.xMax - inset
            : openingCenter;
  return { type: 'goal', hitPoint: { x, y: GOAL_OPENING.y } };
}

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
  const [demonstrationStep, setDemonstrationStep] = useState(0);
  const [introPhase, setIntroPhase] = useState<IntroPhase>('ready');
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
        setDemonstrationIndex(null);
        setDemonstrationStep(0);
        setIntroPhase(response.demonstrations.length > 0 ? 'ready' : 'practice');
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
  const isPracticeReady = introPhase === 'practice-ready';
  const demonstrationSeed = `${run?.seed ?? ''}:demonstration:${demonstrationIndex}`;
  const demonstrationDelayMs = demonstrationScenario && run
    ? demonstrationStep > 0
      ? 900
      : Math.min(
        8_000,
        Math.max(
          5_500,
          demonstrationScenario.targetTapTimeMs + 2 * (1000 / run.scene.speeds.shooter_frequency),
        ),
      )
    : undefined;
  const demonstrationSceneElapsedMs = useMemo(() => {
    if (!demonstrationScenario || !run || demonstrationDelayMs === undefined) return 0;
    if (demonstrationScenario.exerciseKey === 'board-side' || demonstrationScenario.exerciseKey === 'second-tempo' || demonstrationScenario.exerciseKey === 'rhythm-reset') return 0;
    const phaseOffsets = getSessionPhaseOffsets(demonstrationSeed);
    const goalieConfig = {
      ...run.scene.goalie_config,
      frequency: run.scene.speeds.goalie_frequency,
      goalFrequency: run.scene.speeds.goal_frequency,
    };
    let bestElapsed = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let elapsed = 0; elapsed <= 20_000; elapsed += 50) {
      const tapTime = elapsed + demonstrationDelayMs;
      const input = {
        tapTime,
        shooterTapTime: tapTime,
        puckSpeedPerMs: run.scene.speeds.puck_speed_per_ms,
        shooterFrequency: run.scene.speeds.shooter_frequency,
        goalieFrequency: run.scene.speeds.goalie_frequency,
        goalFrequency: run.scene.speeds.goal_frequency,
      };
      const opening = getPerspectiveCourtGoalOpening(input, goalieConfig, phaseOffsets);
      const openingCenter = (opening.xMin + opening.xMax) / 2;
      const goalieCrossTime = tapTime + (PUCK_START.y - GOALIE_Y) / input.puckSpeedPerMs;
      const goalieX = simulateGoalie(goalieConfig, demonstrationSeed, 1, goalieCrossTime, phaseOffsets.goalie).position.x;
      const goalieBeforeX = simulateGoalie(goalieConfig, demonstrationSeed, 1, goalieCrossTime - 80, phaseOffsets.goalie).position.x;
      const visualGoalieX = PERSPECTIVE_COURT_VISUAL_X_CENTER +
        (goalieX - PERSPECTIVE_COURT_VISUAL_X_CENTER) * PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE;
      const visualGoalieBeforeX = PERSPECTIVE_COURT_VISUAL_X_CENTER +
        (goalieBeforeX - PERSPECTIVE_COURT_VISUAL_X_CENTER) * PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE;
      const speed = Math.abs(visualGoalieX - visualGoalieBeforeX);
      const distance = Math.abs(visualGoalieX - openingCenter);
      const movingAway = distance > Math.abs(visualGoalieBeforeX - openingCenter);
      const score = demonstrationScenario.exerciseKey === 'open-net'
        ? distance
        : demonstrationScenario.exerciseKey === 'crossing'
          ? -Math.abs(openingCenter - PERSPECTIVE_COURT_VISUAL_X_CENTER) - Math.abs(visualGoalieX - PERSPECTIVE_COURT_VISUAL_X_CENTER)
          : demonstrationScenario.exerciseKey === 'goalie-leaving'
            ? speed + (movingAway ? 100 : 0)
            : demonstrationScenario.exerciseKey === 'narrow-gap'
              ? -distance
              : speed;
      if (score > bestScore) {
        bestScore = score;
        bestElapsed = elapsed;
      }
    }
    return bestElapsed;
  }, [demonstrationDelayMs, demonstrationScenario, demonstrationSeed, run]);
  const demonstrationShooterElapsedMs = (demonstrationScenario?.requiredSide || demonstrationScenario?.exerciseKey === 'crossing') && run
    ? (() => {
        const periodMs = 1000 / run.scene.speeds.shooter_frequency;
        const desiredElapsedMs = demonstrationScenario.requiredSide === 'left'
          ? 0
          : demonstrationScenario.requiredSide === 'right'
            ? periodMs / 2
            : periodMs / 4;
        const shooterPhaseOffsetMs = getSessionPhaseOffsets(demonstrationSeed).shooter;
        return (
          desiredElapsedMs - (demonstrationDelayMs ?? 0) - shooterPhaseOffsetMs + 8 * periodMs
        ) % periodMs;
      })()
    : 0;

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
        setFeedback(
          exerciseKey === 'board-side' && response.feedback_code === 'goal_wrong_technique'
            ? `Не засчитано: бросок сделан не у ${run.scenario.requiredSide === 'left' ? 'левого' : 'правого'} борта`
            : advancedTrainingFeedbackCopy(response.feedback_code),
        );
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

  const showIntroModal = introPhase === 'ready';
  const showModal = showIntroModal || isPracticeReady || stageFinished;
  const shotResolver: PlayShotResolver = (context) => isDemonstrating && demonstrationScenario
    ? demonstrationResult(demonstrationScenario, demonstrationStep, context)
    : resolvePerspectiveCourtShot(
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
        active={!showModal && (isDemonstrating || introPhase === 'practice')}
        seed={isDemonstrating ? demonstrationSeed : run.seed}
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
        timer={`${introPhase === 'practice' ? Math.min(run.situation_index + 1, run.total_situations) : 0}/${run.total_situations}`}
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
          ? `Показ ${Number(demonstrationIndex) + 1} из ${demonstrationScenarios.length}: ${DEMONSTRATION_COPY[exerciseKey]}`
          : (feedback ?? (
              run.scenario.requiredSide === 'left'
                ? 'Дождитесь игрока у левого борта и бросайте из крайней позиции'
                : run.scenario.requiredSide === 'right'
                  ? 'Дождитесь игрока у правого борта и бросайте из крайней позиции'
                  : error
            ))}
        statusNoticeTone={feedback ? feedbackTone : 'error'}
        statusNoticeDelayMs={500}
        autoShotDelayMs={demonstrationDelayMs}
        clockRebaseKey={isDemonstrating ? `advanced-demonstration-${demonstrationIndex}-${demonstrationStep}` : undefined}
        initialSceneElapsedMs={isDemonstrating ? demonstrationSceneElapsedMs : undefined}
        initialShooterElapsedMs={isDemonstrating ? demonstrationShooterElapsedMs : undefined}
        onResultComplete={() => {
          if (isDemonstrating) {
            const requiredSteps = demonstrationScenario.seriesGoals + (demonstrationScenario.intentionalMissFirst ? 1 : 0);
            if (demonstrationStep + 1 < requiredSteps) {
              setDemonstrationStep((current) => current + 1);
              return;
            }
            if (demonstrationIndex !== null && demonstrationIndex + 1 < demonstrationScenarios.length) {
              setDemonstrationStep(0);
              setDemonstrationIndex(demonstrationIndex + 1);
              return;
            }
            setDemonstrationIndex(null);
            setDemonstrationStep(0);
            setIntroPhase('practice-ready');
            return;
          }
          resultAnimationCompleteRef.current = true;
          if (pendingStageFinishRef.current) setStageFinished(true);
        }}
      />

      <AccessibleModal
        open={showIntroModal}
        title="Сначала – демонстрация"
        onRequestClose={onCourse}
      >
        <p className="modal-copy">{DEMONSTRATION_COPY[exerciseKey]}</p>
        <p className="modal-copy">Будут показаны два правильных выполнения. После них начнётся практика.</p>
        <div className="modal-actions">
          <button
            type="button"
            className="modal-primary btn btn--cta"
            onClick={() => {
              setDemonstrationStep(0);
              setDemonstrationIndex(0);
              setIntroPhase('demonstrating');
            }}
          >
            Показать
          </button>
        </div>
      </AccessibleModal>

      <AccessibleModal
        open={isPracticeReady}
        title="Теперь ваша очередь"
        onRequestClose={onCourse}
      >
        <p className="modal-copy">
          Повтори показанный приём в пяти тренировочных моментах. Ошибки здесь не мешают перейти к зачёту.
        </p>
        <div className="modal-actions">
          <button
            type="button"
            className="modal-primary btn btn--cta"
            onClick={() => setIntroPhase('practice')}
          >
            Начать практику
          </button>
        </div>
      </AccessibleModal>

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
                setDemonstrationIndex(null);
                setDemonstrationStep(0);
                setIntroPhase(response.demonstrations.length > 0 ? 'ready' : 'practice');
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
