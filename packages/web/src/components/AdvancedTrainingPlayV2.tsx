import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { evaluateAdvancedTrainingV2Shot, getAdvancedTrainingV2Scenario, getGoalie,
  resolvePerspectiveCourtShot, type AdvancedTrainingV2Scenario,
  type AdvancedTrainingV2Side, type AdvancedTrainingV2Technique,
  type ShotResult } from '@hockey/game-core';
import { startAdvancedTrainingV2Exercise, type AdvancedTrainingV2RunState } from '../api/advancedTraining.js';
import { startAdvancedTrainingV2Assessment, submitAdvancedTrainingV2Shot,
  type AdvancedTrainingV2ShotResponse } from '../api/advancedTraining.js';
import { PlayView, TRAINING_AMATEUR_GOALIE_OPTIONS, TRAINING_COURSE_GOAL_OPTIONS,
  TRAINING_STREET_PLAYER_OPTIONS, type PlayShotResolver } from '../game/PlayView.js';
import { TRAINING_LONG_COURT_BACKGROUND } from '../game/trainingNewCourt.js';
import { AccessibleModal } from './AccessibleModal.js';
import { ADVANCED_TRAINING_V2_TITLES, getAdvancedTrainingV2Explanation } from './AdvancedTrainingV2Explanation.js';
import { getAdvancedTrainingV2Cue } from './advancedTrainingV2Timing.js';

type Phase = 'intro' | 'demo' | 'explanation' | 'practice-intro' | 'play' |
  'side-transition' | 'practice-finished' | 'completed';

export function AdvancedTrainingPlayV2({ exerciseKey, onBack, onCourse, onCatalogRefresh }: {
  exerciseKey: AdvancedTrainingV2Technique;
  onBack: () => void;
  onCourse: () => void;
  onCatalogRefresh: (key: AdvancedTrainingV2Technique) => void;
}): JSX.Element {
  const [run, setRun] = useState<AdvancedTrainingV2RunState | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [demoSide, setDemoSide] = useState<AdvancedTrainingV2Side>('left');
  const [demoEpoch, setDemoEpoch] = useState(0);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [cueLabel, setCueLabel] = useState<string | null>(null);
  const [sceneEpoch, setSceneEpoch] = useState(0);
  const [reward, setReward] = useState<{ stars: number; experience: number } | null>(null);
  const demoEvaluationRef = useRef<ReturnType<typeof evaluateAdvancedTrainingV2Shot> | null>(null);
  const demoTapTimeRef = useRef<number | null>(null);
  const pendingOutcomeRef = useRef<AdvancedTrainingV2ShotResponse | null>(null);
  const shotPendingRef = useRef(false);
  const timeoutPendingRef = useRef(false);
  const runRef = useRef<AdvancedTrainingV2RunState | null>(null);
  runRef.current = run;
  const startRequestRef = useRef<{ key: AdvancedTrainingV2Technique;
    request: ReturnType<typeof startAdvancedTrainingV2Exercise> } | null>(null);

  useEffect(() => {
    let active = true;
    if (startRequestRef.current?.key !== exerciseKey) {
      startRequestRef.current = { key: exerciseKey,
        request: startAdvancedTrainingV2Exercise(exerciseKey) };
    }
    void startRequestRef.current.request.then(({ state }) => {
      if (!active) return;
      setRun(state);
      setPhase(state.stage === 'practice' && state.side_successes.left >= 1 &&
        state.side_successes.right >= 1 ? 'practice-finished' :
        state.shot_index > 0 || state.stage === 'assessment' ? 'play' : 'intro');
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Не удалось начать упражнение');
    });
    return () => { active = false; };
  }, [exerciseKey]);

  const demoScenario = useMemo(() => getAdvancedTrainingV2Scenario(exerciseKey,
    demoSide, 'demonstration', 0), [exerciseKey, demoSide]);
  const scenario: AdvancedTrainingV2Scenario | null = phase === 'demo' || phase === 'explanation'
    ? demoScenario : run?.scenario ?? null;
  const validatedDemo = useMemo(() => evaluateAdvancedTrainingV2Shot(demoScenario,
    { tapTime: demoScenario.targetTapTimeMs }), [demoScenario]);
  const speedOverrides = scenario ? {
    shooterFreq: scenario.speeds.shooterFrequency,
    goalieFreq: scenario.speeds.goalieFrequency,
    goalFreq: scenario.speeds.goalFrequency,
    puckSpeed: scenario.speeds.puckSpeedPerMs,
  } : undefined;

  const shotResolver: PlayShotResolver = useCallback((context) =>
    resolvePerspectiveCourtShot(context.input, context.goalieConfig, context.seed,
      context.shotIndex, context.stickEffects, context.phaseOffsets), []);

  const startDemonstration = useCallback((side: AdvancedTrainingV2Side) => {
    const selected = getAdvancedTrainingV2Scenario(exerciseKey, side, 'demonstration', 0);
    const validation = evaluateAdvancedTrainingV2Shot(selected,
      { tapTime: selected.targetTapTimeMs });
    if (!validation.success || validation.result.type !== 'goal') {
      setError('Сценарий показа не прошёл проверку движка. Упражнение нельзя запустить.');
      return;
    }
    demoEvaluationRef.current = null;
    demoTapTimeRef.current = null;
    setDemoSide(side);
    setDemoEpoch((value) => value + 1);
    setExplanation(null);
    setPhase('demo');
  }, [exerciseKey]);

  const onResultComplete = useCallback(() => {
    if (phase === 'demo') {
      const evaluation = demoEvaluationRef.current ?? validatedDemo;
      try {
        setExplanation(getAdvancedTrainingV2Explanation(demoScenario, evaluation,
          demoTapTimeRef.current ?? demoScenario.targetTapTimeMs));
      } catch {
        setExplanation('Показ не подтвердил эту ситуацию. Повторите его перед практикой.');
      }
      setPhase('explanation');
      return;
    }
    if (phase !== 'play') return;
    shotPendingRef.current = false;
    timeoutPendingRef.current = false;
    const outcome = pendingOutcomeRef.current;
    pendingOutcomeRef.current = null;
    if (!outcome || (runRef.current?.shot_index ?? 0) > outcome.state.shot_index) {
      setSceneEpoch((value) => value + 1);
      return;
    }
    if (outcome.completed) {
      setReward(outcome.reward_granted);
      onCatalogRefresh(exerciseKey);
      setPhase('completed');
    } else if (outcome.stage_finished && outcome.state.stage === 'practice') {
      setPhase('practice-finished');
    } else if (run?.side !== outcome.state.side) {
      setPhase('side-transition');
    } else {
      setSceneEpoch((value) => value + 1);
    }
  }, [demoScenario, exerciseKey, onCatalogRefresh, phase, run?.side, validatedDemo]);

  const onSceneClock = useCallback((sceneMs: number) => {
    if (phase !== 'play' || !run) return;
    const cue = getAdvancedTrainingV2Cue(run.scenario, sceneMs, run.stage);
    setCueLabel(run.stage === 'practice'
      ? cue.shootNow ? 'Бросай' : cue.traversal === null ? null : String(cue.traversal)
      : null);
    if (!cue.expired) {
      timeoutPendingRef.current = false;
      return;
    }
    if (shotPendingRef.current || timeoutPendingRef.current) return;
    timeoutPendingRef.current = true;
    setFeedback('Момент прошёл. Попробуй ещё раз.');
    setCueLabel(null);
    setSceneEpoch((value) => value + 1);
  }, [phase, run]);

  const applyState = useCallback((state: AdvancedTrainingV2RunState) => {
    if (runRef.current && state.run_id === runRef.current.run_id &&
      state.shot_index < runRef.current.shot_index) return;
    runRef.current = state;
    setRun(state);
  }, []);

  if (!run || !scenario || !speedOverrides) {
    return <main className="screen initial-training-play-state" role={error ? 'alert' : undefined}>
      {error ?? 'Готовим упражнение…'}
      {error ? <button type="button" className="btn btn--ghost" onClick={onCourse}>К упражнениям</button> : null}
    </main>;
  }

  const isDemo = phase === 'demo' || phase === 'explanation';
  const active = phase === 'demo' || phase === 'play';
  const showModal = !active && phase !== 'explanation';

  return <>
    <PlayView<AdvancedTrainingV2RunState>
      suppressedByModal={showModal}
      showIceCar={false}
      onBack={onBack}
      active={active}
      seed={scenario.sessionSeed}
      goalieId={scenario.goalieId}
      goalieConfig={getGoalie(scenario.goalieId)}
      periodNumber={1}
      periodLabel="УПРАЖНЕНИЯ"
      scoreboardPeriodNumber={1}
      scoreboardPeriodsTotal={8}
      speedOverrides={speedOverrides}
      goals={run.side_successes.left + run.side_successes.right}
      scoreLabel="ПРИЁМЫ"
      shots={run.shot_index}
      shotIndexBase={0}
      sceneShotIndex={scenario.shotIndex}
      timer={`${run.side_successes.left + run.side_successes.right}/${run.stage === 'practice' ? 2 : 4}`}
      timerLabel={run.stage === 'practice' ? 'ПРАКТИКА' : 'ЗАЧЁТ'}
      shotButtonLabel={isDemo ? 'ПОКАЗ' : 'БРОСОК'}
      primaryActionBlocked={isDemo}
      backLabel="К упражнениям"
      optimisticAddShot={() => undefined}
      submitShot={async ({ input, claimedResult }) => {
        if (isDemo) return { serverResult: claimedResult, state: run, isCurrent: () => true };
        shotPendingRef.current = true;
        try {
          const response = await submitAdvancedTrainingV2Shot(exerciseKey, {
            run_id: run.run_id, shot_index: run.shot_index + 1,
            scenario_id: run.scenario_id,
            input: { tapTime: input.tapTime,
              ...(input.shooterTapTime === undefined ? {} : { shooterTapTime: input.shooterTapTime }) },
            claimed_result: claimedResult,
          });
          pendingOutcomeRef.current = response;
          setFeedback(response.success ? 'Верно! Ситуация засчитана.'
            : response.server_result === 'goal'
              ? `Гол, но это ${response.actual_technique === 'ordinary' ? 'простой бросок' :
                response.actual_technique ? ADVANCED_TRAINING_V2_TITLES[response.actual_technique] : 'другая ситуация'}.`
              : response.server_result === 'save' ? 'Сэйв: вратарь перекрыл бросок.'
                : 'Мимо: шайба не попала в ворота.');
          return {
            serverResult: response.server_result, state: response.state,
            isCurrent: () => runRef.current?.run_id === response.state.run_id &&
              (runRef.current?.shot_index ?? 0) <= response.state.shot_index,
            resultPresentation: { title: response.success ? 'Верно!' :
              response.server_result === 'goal' ? 'Гол другой категории' :
                response.server_result === 'save' ? 'Сэйв' : 'Мимо' },
          };
        } catch (cause) {
          shotPendingRef.current = false;
          setError(cause instanceof Error ? cause.message : 'Не удалось записать бросок');
          return null;
        }
      }}
      applyState={applyState}
      longCourtBackground={TRAINING_LONG_COURT_BACKGROUND}
      playerOptions={TRAINING_STREET_PLAYER_OPTIONS}
      goalOptions={TRAINING_COURSE_GOAL_OPTIONS}
      goalieOptions={TRAINING_AMATEUR_GOALIE_OPTIONS}
      shotResolver={shotResolver}
      resultCopy={{ goal: 'ГОЛ', save: 'СЭЙВ', miss: 'МИМО' }}
      statusNotice={error ?? feedback ?? (isDemo
        ? `Показ ${demoSide === 'left' ? 'слева' : 'справа'}: ${ADVANCED_TRAINING_V2_TITLES[exerciseKey]}`
        : `Бросайте ${run.side === 'left' ? 'слева' : 'справа'}`)}
      statusNoticeTone={error ? 'error' : feedback ? 'warning' : undefined}
      overlayControls={phase === 'play' && run.stage === 'practice' && cueLabel
        ? <div className="advanced-training-v2-cue" role="status" aria-live="polite">{cueLabel}</div>
        : undefined}
      onSceneClock={onSceneClock}
      autoShotDelayMs={phase === 'demo' ? demoScenario.targetTapTimeMs - demoScenario.sceneStartMs : undefined}
      clockRebaseKey={`${scenario.id}:${isDemo ? demoEpoch : `${run.shot_index}:${sceneEpoch}`}`}
      initialSceneElapsedMs={scenario.sceneStartMs}
      initialShooterElapsedMs={scenario.sceneStartMs}
      onShotResolved={isDemo ? ({ input }) => {
        demoTapTimeRef.current = input.tapTime;
        demoEvaluationRef.current = evaluateAdvancedTrainingV2Shot(demoScenario, {
          tapTime: input.tapTime,
          ...(input.shooterTapTime === undefined ? {} : { shooterTapTime: input.shooterTapTime }),
        });
        return null;
      } : undefined}
      onResultComplete={onResultComplete}
      waitForShotResponseBeforeResultClose
      holdSceneAfterResult={isDemo}
    />

    <AccessibleModal open={phase === 'intro'} title="Сначала — показ" onRequestClose={onCourse}>
      <p className="modal-copy">Сначала посмотрите настоящий бросок слева и справа. Потом попробуете сами.</p>
      <div className="modal-actions"><button type="button" className="modal-primary btn btn--cta"
        onClick={() => startDemonstration('left')}>Показать слева</button></div>
    </AccessibleModal>

    <AccessibleModal open={phase === 'explanation'} title="Почему это гол" onRequestClose={onCourse}>
      <p className="modal-copy">{explanation}</p>
      <div className="modal-actions">
        <button type="button" className="btn btn--ghost"
          onClick={() => startDemonstration(demoSide)}>Повторить показ</button>
        <button type="button" className="modal-primary btn btn--cta"
          onClick={() => {
            if (demoSide === 'left') startDemonstration('right');
            else setPhase('practice-intro');
          }}>{demoSide === 'left' ? 'Показать справа' : 'Перейти к практике'}</button>
      </div>
    </AccessibleModal>

    <AccessibleModal open={phase === 'practice-intro'} title="Теперь ваша очередь" onRequestClose={onCourse}>
      <p className="modal-copy">Сначала один правильный гол слева, затем один справа.</p>
      <div className="modal-actions"><button type="button" className="modal-primary btn btn--cta"
        onClick={() => setPhase('play')}>Начать практику</button></div>
    </AccessibleModal>

    <AccessibleModal open={phase === 'side-transition'} title="Смена стороны" onRequestClose={onCourse}>
      <p className="modal-copy">Отлично! Теперь попробуй {run.side === 'right' ? 'справа' : 'слева'}.</p>
      <div className="modal-actions"><button type="button" className="modal-primary btn btn--cta"
        onClick={() => { setFeedback(null); setCueLabel(null); setPhase('play'); }}>
        Продолжить
      </button></div>
    </AccessibleModal>

    <AccessibleModal open={phase === 'practice-finished'} title="Практика завершена" onRequestClose={onCourse}>
      <p className="modal-copy">По одному правильному голу с каждой стороны. Теперь зачёт: по два с каждой стороны, без подсказок.</p>
      <div className="modal-actions"><button type="button" className="modal-primary btn btn--cta"
        onClick={() => void startAdvancedTrainingV2Assessment(exerciseKey, run.run_id)
          .then(({ state }) => { applyState(state); setFeedback(null); setCueLabel(null); setPhase('play'); })
          .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Не удалось начать зачёт'))}>
        Начать зачёт
      </button></div>
    </AccessibleModal>

    <AccessibleModal open={phase === 'completed'} title="Упражнение пройдено" onRequestClose={onCourse}>
      <p className="modal-copy">По два правильных гола слева и справа.
        {reward ? ` Награда: ${reward.stars} звезда и ${reward.experience} опыт.` : ' Награда уже получена.'}</p>
      <div className="modal-actions"><button type="button" className="modal-primary btn btn--cta"
        onClick={onCourse}>К упражнениям</button></div>
    </AccessibleModal>
  </>;
}
