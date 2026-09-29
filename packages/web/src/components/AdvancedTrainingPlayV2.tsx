import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { evaluateAdvancedTrainingV2Shot, getAdvancedTrainingV2Scenario, getGoalie,
  resolvePerspectiveCourtShot, type AdvancedTrainingV2Scenario,
  type AdvancedTrainingV2Side, type AdvancedTrainingV2Technique,
  type ShotResult } from '@hockey/game-core';
import { startAdvancedTrainingV2Exercise, type AdvancedTrainingV2RunState } from '../api/advancedTraining.js';
import { PlayView, TRAINING_AMATEUR_GOALIE_OPTIONS, TRAINING_COURSE_GOAL_OPTIONS,
  TRAINING_STREET_PLAYER_OPTIONS, type PlayShotResolver } from '../game/PlayView.js';
import { TRAINING_LONG_COURT_BACKGROUND } from '../game/trainingNewCourt.js';
import { AccessibleModal } from './AccessibleModal.js';
import { ADVANCED_TRAINING_V2_TITLES, getAdvancedTrainingV2Explanation } from './AdvancedTrainingV2Explanation.js';

type Phase = 'intro' | 'demo' | 'explanation' | 'practice-intro' | 'play';

export function AdvancedTrainingPlayV2({ exerciseKey, onBack, onCourse, onCatalogRefresh: _onCatalogRefresh }: {
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
  const demoEvaluationRef = useRef<ReturnType<typeof evaluateAdvancedTrainingV2Shot> | null>(null);
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
      setPhase(state.shot_index > 0 || state.stage === 'assessment' ? 'play' : 'intro');
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
  const scenarioValid = validatedDemo.success && validatedDemo.result.type === 'goal';
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
    if (!scenarioValid && side === demoSide) {
      setError('Сценарий показа не прошёл проверку движка. Упражнение нельзя запустить.');
      return;
    }
    demoEvaluationRef.current = null;
    setDemoSide(side);
    setDemoEpoch((value) => value + 1);
    setExplanation(null);
    setPhase('demo');
  }, [demoSide, scenarioValid]);

  const onResultComplete = useCallback(() => {
    if (phase !== 'demo') return;
    const evaluation = demoEvaluationRef.current ?? validatedDemo;
    try {
      setExplanation(getAdvancedTrainingV2Explanation(demoScenario, evaluation));
    } catch {
      setExplanation('Показ не подтвердил эту ситуацию. Повторите его перед практикой.');
    }
    setPhase('explanation');
  }, [demoScenario, phase, validatedDemo]);

  if (!run || !scenario || !speedOverrides) {
    return <main className="screen initial-training-play-state" role={error ? 'alert' : undefined}>
      {error ?? 'Готовим упражнение…'}
      {error ? <button type="button" className="btn btn--ghost" onClick={onCourse}>К упражнениям</button> : null}
    </main>;
  }

  const isDemo = phase === 'demo' || phase === 'explanation';
  const active = phase === 'demo' || phase === 'play';
  const showModal = !active;

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
      timer={`${run.side_successes.left + run.side_successes.right}/${run.stage === 'practice' ? 2 : 4}`}
      timerLabel={run.stage === 'practice' ? 'ПРАКТИКА' : 'ЗАЧЁТ'}
      shotButtonLabel={isDemo ? 'ПОКАЗ' : 'БРОСОК'}
      primaryActionBlocked={isDemo}
      backLabel="К упражнениям"
      optimisticAddShot={() => undefined}
      submitShot={async ({ claimedResult }) => ({
        serverResult: claimedResult, state: run, isCurrent: () => true,
      })}
      applyState={setRun}
      longCourtBackground={TRAINING_LONG_COURT_BACKGROUND}
      playerOptions={TRAINING_STREET_PLAYER_OPTIONS}
      goalOptions={TRAINING_COURSE_GOAL_OPTIONS}
      goalieOptions={TRAINING_AMATEUR_GOALIE_OPTIONS}
      shotResolver={shotResolver}
      resultCopy={{ goal: 'ГОЛ', save: 'СЭЙВ', miss: 'МИМО' }}
      statusNotice={isDemo
        ? `Показ ${demoSide === 'left' ? 'слева' : 'справа'}: ${ADVANCED_TRAINING_V2_TITLES[exerciseKey]}`
        : `Бросайте ${run.side === 'left' ? 'слева' : 'справа'}`}
      autoShotDelayMs={phase === 'demo' ? demoScenario.targetTapTimeMs - demoScenario.sceneStartMs : undefined}
      clockRebaseKey={`${scenario.id}:${isDemo ? demoEpoch : run.shot_index}`}
      initialSceneElapsedMs={scenario.sceneStartMs}
      initialShooterElapsedMs={scenario.sceneStartMs}
      onShotResolved={isDemo ? ({ input }) => {
        demoEvaluationRef.current = evaluateAdvancedTrainingV2Shot(demoScenario, {
          tapTime: input.tapTime,
          ...(input.shooterTapTime === undefined ? {} : { shooterTapTime: input.shooterTapTime }),
        });
        return null;
      } : undefined}
      onResultComplete={onResultComplete}
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
  </>;
}
