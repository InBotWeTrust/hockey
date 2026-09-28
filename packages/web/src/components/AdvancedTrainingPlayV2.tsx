import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GOAL, GOALIE_Y, GOAL_OPENING, PUCK_START, RINK,
  PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE, PERSPECTIVE_COURT_GOALIE_VISUAL_Y_OFFSET,
  PERSPECTIVE_COURT_GOAL_VISUAL_OFFSET_X_SCALE, PERSPECTIVE_COURT_GOAL_VISUAL_Y_OFFSET,
  PERSPECTIVE_COURT_VISUAL_X_CENTER, PERSPECTIVE_COURT_VISUAL_Y_OFFSET,
  PERSPECTIVE_COURT_VISUAL_Y_SCALE,
  evaluateAdvancedTrainingV2Shot, getAdvancedTrainingV2Scenario, getGoalie,
  findNextAdvancedTrainingWindow, getAdvancedTrainingContinuousSeed, deriveShotSeed,
  type AdvancedTrainingWindow,
  getSessionPhaseOffsets, simulateGoal, simulateGoalie, simulateShooter,
  resolvePerspectiveCourtShot, type AdvancedTrainingV2Scenario,
  type AdvancedTrainingV2Side, type AdvancedTrainingV2Technique } from '@hockey/game-core';
import { startAdvancedTrainingV2Exercise, type AdvancedTrainingV2RunState } from '../api/advancedTraining.js';
import { startAdvancedTrainingV2Assessment, submitAdvancedTrainingV2Shot,
  type AdvancedTrainingV2ShotResponse } from '../api/advancedTraining.js';
import { PlayView, TRAINING_AMATEUR_GOALIE_OPTIONS, TRAINING_COURSE_GOAL_OPTIONS,
  TRAINING_STREET_PLAYER_OPTIONS, type PlayShotResolver } from '../game/PlayView.js';
import { TRAINING_LONG_COURT_BACKGROUND } from '../game/trainingNewCourt.js';
import { AccessibleModal } from './AccessibleModal.js';
import { ADVANCED_TRAINING_V2_TITLES, getAdvancedTrainingV2Explanation,
  getAdvancedTrainingV2FailureExplanation, getAdvancedTrainingV2StopHint,
  type TrainingMotionDirection } from './AdvancedTrainingV2Explanation.js';
import { PRACTICE_SHOT_ARM_LEAD_MS, PRACTICE_SHOT_SLOW_LEAD_MS,
  PRACTICE_SHOT_SLOW_SCALE, getAdvancedTrainingContinuousCue } from './advancedTrainingV2Timing.js';

type Phase = 'intro' | 'demo' | 'explanation' | 'practice-intro' | 'play' |
  'side-transition' | 'practice-finished' | 'completed';

type DemoDirectionMarker = { name: string; x: number; y: number;
  direction: TrainingMotionDirection; color: string };

type DemoFuturePreview = { goalX: number; goalY: number; goalieX: number; goalieY: number;
  goalDirection: TrainingMotionDirection; goalieDirection: TrainingMotionDirection };

function getContinuousDemoScenario(technique: AdvancedTrainingV2Technique,
  side: AdvancedTrainingV2Side): AdvancedTrainingV2Scenario {
  const base = getAdvancedTrainingV2Scenario(technique, side, 'demonstration', 0);
  const sessionSeed = getAdvancedTrainingContinuousSeed(technique);
  const movement = { runSeed: sessionSeed, technique, side,
    speeds: base.speeds, goalieId: base.goalieId };
  const window = findNextAdvancedTrainingWindow(movement, 0);
  if (!window) throw new Error('No valid demonstration moment on the exercise trajectory');
  return { ...base, sessionSeed, shotSeed: deriveShotSeed(sessionSeed, 1, 1),
    sceneStartMs: Math.max(0, window.targetMs - 4 * 500 / base.speeds.shooterFrequency),
    targetTapTimeMs: window.targetMs };
}

function getDemoFuturePreview(scenario: AdvancedTrainingV2Scenario): DemoFuturePreview {
  const offsets = getSessionPhaseOffsets(scenario.sessionSeed);
  const goalie = getGoalie(scenario.goalieId);
  const goalFlightMs = (PUCK_START.y - GOAL_OPENING.y) / scenario.speeds.puckSpeedPerMs;
  const goalieFlightMs = (PUCK_START.y - GOALIE_Y) / scenario.speeds.puckSpeedPerMs;
  const goalAt = scenario.targetTapTimeMs + goalFlightMs;
  const goalieAt = scenario.targetTapTimeMs + goalieFlightMs;
  const goalSettings = { ...goalie, goalFrequency: scenario.speeds.goalFrequency };
  const goalieSettings = { ...goalie, frequency: scenario.speeds.goalieFrequency };
  const goalPosition = (time: number) => simulateGoal(goalSettings, time, offsets.goal).offsetX;
  const goaliePosition = (time: number) => simulateGoalie(goalieSettings,
    scenario.shotSeed, scenario.shotIndex, time, offsets.goalie).position.x;
  const motion = (before: number, after: number): TrainingMotionDirection =>
    after > before ? 'right' : after < before ? 'left' : 'still';
  const goalOffset = goalPosition(goalAt);
  const goalieState = simulateGoalie({ ...goalie, frequency: scenario.speeds.goalieFrequency },
    scenario.shotSeed, scenario.shotIndex,
    goalieAt, offsets.goalie);
  const goalieCenterX = TRAINING_AMATEUR_GOALIE_OPTIONS.visualXCenter ??
    PERSPECTIVE_COURT_VISUAL_X_CENTER;
  return {
    goalX: GOAL.x + GOAL.width / 2 + goalOffset *
      (TRAINING_COURSE_GOAL_OPTIONS.visualOffsetXScale ?? 1),
    goalY: (GOAL.y + GOAL.height) * (TRAINING_COURSE_GOAL_OPTIONS.visualYScale ?? 1) +
      (TRAINING_COURSE_GOAL_OPTIONS.visualYOffset ?? 0),
    goalieX: goalieCenterX + (goalieState.position.x - goalieCenterX) *
      (TRAINING_AMATEUR_GOALIE_OPTIONS.visualXScale ?? 1),
    goalieY: GOALIE_Y * (TRAINING_AMATEUR_GOALIE_OPTIONS.visualYScale ?? 1) +
      (TRAINING_AMATEUR_GOALIE_OPTIONS.visualYOffset ?? 0),
    goalDirection: motion(goalPosition(goalAt - 5), goalPosition(goalAt + 5)),
    goalieDirection: motion(goaliePosition(goalieAt - 5), goaliePosition(goalieAt + 5)),
  };
}

function DemoFutureEntities({ preview }: { preview: DemoFuturePreview }): JSX.Element {
  const goalWidth = TRAINING_COURSE_GOAL_OPTIONS.gateWidth ?? 99;
  const goalHeight = goalWidth / (TRAINING_COURSE_GOAL_OPTIONS.gateAspect ?? 99 / 53);
  const goalAnchorY = TRAINING_COURSE_GOAL_OPTIONS.spriteAnchorY ?? 0.5;
  const goalieSize = 69 * (TRAINING_AMATEUR_GOALIE_OPTIONS.sizeScale ?? 1) *
    (TRAINING_AMATEUR_GOALIE_OPTIONS.idleSizeScale ?? 1);
  return <svg viewBox={`0 0 ${RINK.width} ${RINK.height}`} aria-label="Положение при прилёте шайбы"
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
      pointerEvents: 'none', overflow: 'visible' }}>
    <g aria-label="Ворота при прилёте шайбы" data-center-x={preview.goalX}>
      <image href={TRAINING_COURSE_GOAL_OPTIONS.spriteUrl ?? '/sprites/gate.webp'}
        x={preview.goalX - goalWidth / 2} y={preview.goalY - goalHeight * goalAnchorY}
        width={goalWidth} height={goalHeight} opacity="0.38" />
    </g>
    <g aria-label="Вратарь при встрече с шайбой" data-center-x={preview.goalieX}>
      <image href={TRAINING_AMATEUR_GOALIE_OPTIONS.idleSpriteUrl ?? '/sprites/goalkeeper.webp'}
        x={preview.goalieX - goalieSize / 2} y={preview.goalieY - goalieSize / 2}
        width={goalieSize} height={goalieSize} opacity="0.38" />
    </g>
  </svg>;
}

function getDemoTapDirections(scenario: AdvancedTrainingV2Scenario): readonly DemoDirectionMarker[] {
  const t = scenario.targetTapTimeMs;
  const offsets = getSessionPhaseOffsets(scenario.sessionSeed);
  const goalie = { ...getGoalie(scenario.goalieId), frequency: scenario.speeds.goalieFrequency,
    goalFrequency: scenario.speeds.goalFrequency };
  const direction = (before: number, after: number): TrainingMotionDirection =>
    after > before ? 'right' : after < before ? 'left' : 'still';
  const playerBefore = simulateShooter(t - 5 + offsets.shooter, scenario.speeds.shooterFrequency).x;
  const playerNow = simulateShooter(t + offsets.shooter, scenario.speeds.shooterFrequency).x;
  const playerAfter = simulateShooter(t + 5 + offsets.shooter, scenario.speeds.shooterFrequency).x;
  const goalBefore = simulateGoal(goalie, t - 5, offsets.goal).offsetX;
  const goalNow = simulateGoal(goalie, t, offsets.goal).offsetX;
  const goalAfter = simulateGoal(goalie, t + 5, offsets.goal).offsetX;
  const keeperBefore = simulateGoalie(goalie, scenario.shotSeed, scenario.shotIndex,
    t - 5, offsets.goalie).position.x;
  const keeperNow = simulateGoalie(goalie, scenario.shotSeed, scenario.shotIndex,
    t, offsets.goalie).position.x;
  const keeperAfter = simulateGoalie(goalie, scenario.shotSeed, scenario.shotIndex,
    t + 5, offsets.goalie).position.x;
  return [
    { name: 'Игрок', x: playerNow,
      y: PUCK_START.y * PERSPECTIVE_COURT_VISUAL_Y_SCALE + PERSPECTIVE_COURT_VISUAL_Y_OFFSET,
      direction: direction(playerBefore, playerAfter), color: '#3b82f6' },
    { name: 'Ворота',
      x: PERSPECTIVE_COURT_VISUAL_X_CENTER + goalNow * PERSPECTIVE_COURT_GOAL_VISUAL_OFFSET_X_SCALE,
      y: (GOAL.y + GOAL.height) * PERSPECTIVE_COURT_VISUAL_Y_SCALE +
        PERSPECTIVE_COURT_GOAL_VISUAL_Y_OFFSET - 70,
      direction: direction(goalBefore, goalAfter), color: '#22c55e' },
    { name: 'Вратарь',
      x: PERSPECTIVE_COURT_VISUAL_X_CENTER +
        (keeperNow - PERSPECTIVE_COURT_VISUAL_X_CENTER) * PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE,
      y: GOALIE_Y * PERSPECTIVE_COURT_VISUAL_Y_SCALE +
        PERSPECTIVE_COURT_GOALIE_VISUAL_Y_OFFSET + 66,
      direction: direction(keeperBefore, keeperAfter), color: '#ef4444' },
  ];
}

function DemoDirectionOverlay({ markers, preview }: { markers: readonly DemoDirectionMarker[];
  preview: DemoFuturePreview }): JSX.Element {
  const futureMarkers: readonly DemoDirectionMarker[] = [
    { name: 'Будущие ворота', x: preview.goalX, y: preview.goalY - 70,
      direction: preview.goalDirection, color: '#22c55e' },
    { name: 'Будущий вратарь', x: preview.goalieX, y: preview.goalieY + 66,
      direction: preview.goalieDirection, color: '#ef4444' },
  ];
  return <svg viewBox={`0 0 ${RINK.width} ${RINK.height}`} aria-label="Направления движения"
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
      pointerEvents: 'none', overflow: 'visible' }}>
    <line aria-label="Линия броска игрока" x1={markers[0]!.x} x2={markers[0]!.x}
      y1={(GOAL.y + GOAL.height) * PERSPECTIVE_COURT_VISUAL_Y_SCALE +
        PERSPECTIVE_COURT_GOAL_VISUAL_Y_OFFSET}
      y2={markers[0]!.y - 14} stroke="#245f9b" strokeWidth={1.5}
      strokeDasharray="6 5" />
    {[...markers, ...futureMarkers].map(({ name, x, y, direction, color }) => <g key={name}
      aria-label={`${name} ${direction === 'still' ? 'стоит' :
        `движ${name.includes('ворота') || name === 'Ворота' ? 'утся' : 'ется'} ${direction === 'left' ? 'влево' : 'вправо'}`}`}
      transform={`translate(${x} ${y})`} opacity={name.startsWith('Будущ') ? 0.38 : 1}>
      <circle r="20" fill="rgba(11, 39, 67, 0.88)" stroke={color} strokeWidth="3" />
      {direction === 'still' ? <circle r="4" fill={color} /> :
        <path d="M -9 0 H 9 M 2 -7 L 9 0 L 2 7"
          transform={direction === 'left' ? 'rotate(180)' : undefined}
          fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"
          strokeLinejoin="round" />}
    </g>)}
  </svg>;
}

function DemoCoachModalAvatar(): JSX.Element {
  return <img className="advanced-training-v2-modal__avatar"
    src="/sprites/advanced-training-coach-modal.webp" alt="Аватар наставника в модалке"
    width={44} height={44} />;
}

function practiceSideNotice(technique: AdvancedTrainingV2Technique,
  side: AdvancedTrainingV2Side): string {
  let detail: string;
  if (technique === 'near_goalie') detail = `${side === 'left' ? 'Слева' : 'Справа'} от ворот`;
  else if (technique === 'corner') detail = `У ${side === 'left' ? 'левого' : 'правого'} борта`;
  else if (technique === 'counter_direction' || technique === 'behind_goalie') {
    detail = `Ты движешься ${side === 'left' ? 'влево' : 'вправо'}`;
  } else detail = `Проход ${side === 'left' ? 'слева' : 'справа'} от вратаря`;
  return `Упражнение "${ADVANCED_TRAINING_V2_TITLES[technique]}"\n(${detail})`;
}

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
  const [demoReady, setDemoReady] = useState(false);
  const [demoShotTrigger, setDemoShotTrigger] = useState(0);
  const [demoFired, setDemoFired] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [coachFeedback, setCoachFeedback] = useState<string | null>(null);
  const [resumeHeldResultKey, setResumeHeldResultKey] = useState(0);
  const [feedbackRevision, setFeedbackRevision] = useState(0);
  const [cueLabel, setCueLabel] = useState<string | null>(null);
  const [opportunity, setOpportunity] = useState<AdvancedTrainingWindow | null>(null);
  const [reward, setReward] = useState<{ stars: number; experience: number } | null>(null);
  const demoEvaluationRef = useRef<ReturnType<typeof evaluateAdvancedTrainingV2Shot> | null>(null);
  const pendingOutcomeRef = useRef<AdvancedTrainingV2ShotResponse | null>(null);
  const shotPendingRef = useRef(false);
  const timeoutPendingRef = useRef(false);
  const runRef = useRef<AdvancedTrainingV2RunState | null>(null);
  runRef.current = run;
  const startRequestRef = useRef<{ key: AdvancedTrainingV2Technique;
    request: ReturnType<typeof startAdvancedTrainingV2Exercise> } | null>(null);

  useEffect(() => {
    if (!run) return;
    const next = findNextAdvancedTrainingWindow(run.movement, run.resume_scene_ms);
    setOpportunity(next);
    if (!next) setError('Не удалось найти следующий момент для броска. Прогресс сохранён.');
  }, [run?.shot_index, run?.side, run?.stage, run?.run_id]);

  useEffect(() => {
    if (feedback !== 'Момент прошёл. Попробуй ещё раз.' &&
      !feedback?.startsWith('Мимо:') && !feedback?.startsWith('Сэйв:')) return;
    const timer = window.setTimeout(() => setFeedback((current) =>
      current === feedback ? null : current), 1500);
    return () => window.clearTimeout(timer);
  }, [feedback, feedbackRevision]);

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

  const demoScenario = useMemo(() => getContinuousDemoScenario(exerciseKey, demoSide),
    [exerciseKey, demoSide]);
  const scenario: AdvancedTrainingV2Scenario | null = phase === 'demo' || phase === 'explanation'
    ? demoScenario : run?.scenario ?? null;
  const validatedDemo = useMemo(() => evaluateAdvancedTrainingV2Shot(demoScenario,
    { tapTime: demoScenario.targetTapTimeMs }), [demoScenario]);
  const demoDirections = useMemo(() => getDemoTapDirections(demoScenario), [demoScenario]);
  const demoFuturePreview = useMemo(() => getDemoFuturePreview(demoScenario), [demoScenario]);
  const demoStopHint = getAdvancedTrainingV2StopHint(demoScenario, {
    player: demoDirections[0]!.direction,
    goal: demoDirections[1]!.direction,
    goalie: demoDirections[2]!.direction,
  });
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
    const selected = getContinuousDemoScenario(exerciseKey, side);
    const validation = evaluateAdvancedTrainingV2Shot(selected,
      { tapTime: selected.targetTapTimeMs });
    if (!validation.success || validation.result.type !== 'goal') {
      setError('Сценарий показа не прошёл проверку движка. Упражнение нельзя запустить.');
      return;
    }
    demoEvaluationRef.current = null;
    setDemoReady(false);
    setDemoFired(false);
    setDemoSide(side);
    setDemoEpoch((value) => value + 1);
    setExplanation(null);
    setPhase('demo');
  }, [exerciseKey]);

  const onResultComplete = useCallback(() => {
    if (phase === 'demo') {
      const evaluation = demoEvaluationRef.current ?? validatedDemo;
      try {
        setExplanation(getAdvancedTrainingV2Explanation(demoScenario, evaluation));
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
      return;
    }
    if (outcome.server_result === 'goal' && !outcome.success) {
      setCoachFeedback(getAdvancedTrainingV2FailureExplanation(run!.scenario,
        outcome.actual_technique, outcome.measurements));
      setCueLabel(null);
      return;
    }
    if (outcome.server_result === 'save') setFeedback('Сэйв: вратарь перекрыл бросок.');
    if (outcome.server_result === 'miss') setFeedback('Мимо: шайба не попала в ворота.');
    setFeedbackRevision((value) => value + 1);
    if (outcome.completed) {
      setReward(outcome.reward_granted);
      onCatalogRefresh(exerciseKey);
      setPhase('completed');
    } else if (outcome.stage_finished && outcome.state.stage === 'practice') {
      setPhase('practice-finished');
    } else if (run?.side !== outcome.state.side) {
      setPhase('side-transition');
    } else {
      setResumeHeldResultKey((value) => value + 1);
    }
  }, [demoScenario, exerciseKey, onCatalogRefresh, phase, run?.side, validatedDemo]);

  const onSceneClock = useCallback((sceneMs: number) => {
    if (phase === 'demo') {
      if (sceneMs >= demoScenario.targetTapTimeMs && !demoFired) setDemoReady(true);
      return;
    }
    if (phase !== 'play' || !run || !opportunity || coachFeedback || shotPendingRef.current) return;
    const cue = getAdvancedTrainingContinuousCue(opportunity, sceneMs,
      run.movement.speeds.shooterFrequency, run.stage);
    setCueLabel(cue.shootNow ? 'Бросай'
      : cue.secondsRemaining === null ? null : String(cue.secondsRemaining));
    if (!cue.expired) {
      timeoutPendingRef.current = false;
      return;
    }
    if (shotPendingRef.current || timeoutPendingRef.current) return;
    timeoutPendingRef.current = true;
    setFeedback('Момент прошёл. Попробуй ещё раз.');
    setFeedbackRevision((value) => value + 1);
    setCueLabel(null);
    const next = findNextAdvancedTrainingWindow(run.movement, opportunity.endMs + 1);
    setOpportunity(next);
    if (!next) setError('Не удалось найти следующий момент для броска. Прогресс сохранён.');
  }, [coachFeedback, demoFired, demoScenario.targetTapTimeMs, opportunity, phase, run]);

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
      seed={isDemo ? scenario.sessionSeed : run.movement.runSeed}
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
      sceneShotIndex={isDemo ? scenario.shotIndex : 1}
      timer={`${run.side_successes.left + run.side_successes.right}/${run.stage === 'practice' ? 2 : 4}`}
      timerLabel={run.stage === 'practice' ? 'ПРАКТИКА' : 'ЗАЧЁТ'}
      shotButtonLabel="БРОСОК"
      primaryActionBlocked={isDemo || Boolean(coachFeedback)}
      hitboxesVisible={false}
      maxSceneTimeMs={phase === 'demo' && !demoFired ? demoScenario.targetTapTimeMs : undefined}
      shotTriggerKey={demoShotTrigger}
      sceneTimeScale={phase === 'play' && run.stage === 'practice'
        ? (sceneMs) => opportunity && sceneMs >= opportunity.startMs - PRACTICE_SHOT_SLOW_LEAD_MS &&
          sceneMs <= opportunity.endMs + PRACTICE_SHOT_SLOW_LEAD_MS
          ? PRACTICE_SHOT_SLOW_SCALE : 1
        : undefined}
      practiceShotWindow={phase === 'play' && run.stage === 'practice' && opportunity
        ? { armStartMs: opportunity.startMs - PRACTICE_SHOT_ARM_LEAD_MS,
          targetMs: opportunity.targetMs, endMs: opportunity.endMs }
        : undefined}
      backLabel="К упражнениям"
      optimisticAddShot={() => undefined}
      submitShot={async ({ input, claimedResult }) => {
        if (isDemo) return { serverResult: claimedResult, state: run, isCurrent: () => true };
        shotPendingRef.current = true;
        setCueLabel(null);
        try {
          const response = await submitAdvancedTrainingV2Shot(exerciseKey, {
            run_id: run.run_id, shot_index: run.shot_index + 1,
            movement_id: run.movement_id,
            input: { tapTime: input.tapTime,
              ...(input.shooterTapTime === undefined ? {} : { shooterTapTime: input.shooterTapTime }) },
            claimed_result: claimedResult,
          });
          pendingOutcomeRef.current = response;
          return {
            serverResult: response.server_result, state: response.state,
            isCurrent: () => runRef.current?.run_id === response.state.run_id &&
              (runRef.current?.shot_index ?? 0) <= response.state.shot_index,
            resultPresentation: { title: response.server_result === 'goal' ? 'Гол' :
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
        ? exerciseKey === 'near_goalie'
          ? `Ситуация "Вратарь рядом"\nВратарь ${demoSide === 'left' ? 'слева' : 'справа'} от ворот`
          : `Ситуация "${ADVANCED_TRAINING_V2_TITLES[exerciseKey]}"\nПоказ ${demoSide === 'left' ? 'слева' : 'справа'}`
        : practiceSideNotice(exerciseKey, run.side))}
      statusNoticeTone={error ? 'error' : feedback ? 'warning' : undefined}
      statusNoticeUnderScoreboard
      overlayControlsTop={phase === 'demo' && demoReady && !demoFired || coachFeedback
        ? '49%' : phase === 'play' ? '53%' : undefined}
      overlayControlsCentered={(phase === 'demo' && demoReady && !demoFired) ||
        Boolean(coachFeedback) || phase === 'play'}
      rinkOverlay={phase === 'demo' && demoReady && !demoFired
        ? <DemoDirectionOverlay markers={demoDirections} preview={demoFuturePreview} /> : undefined}
      rinkUnderlay={phase === 'demo' && demoReady && !demoFired
        ? <DemoFutureEntities preview={demoFuturePreview} /> : undefined}
      overlayControls={phase === 'demo' && demoReady && !demoFired
        ? <div className="game-scoreboard advanced-training-v2-demo-stop" role="status">
          <div className="advanced-training-v2-demo-stop__heading">
            <img className="advanced-training-v2-demo-stop__avatar"
              src="/sprites/advanced-training-coach-avatar.webp" alt="Аватар наставника"
              width={42} height={42} />
            <span className="advanced-training-v2-demo-stop__title">Бросок нужно совершать примерно в этот момент</span>
          </div>
          <div className="advanced-training-v2-demo-stop__explanation">
            <p>– {demoStopHint.situation}</p>
            <p>{demoStopHint.instruction}</p>
          </div>
          <button type="button" className="btn btn--cta" onClick={() => {
            setDemoFired(true);
            setDemoReady(false);
            setDemoShotTrigger((value) => value + 1);
          }}>Понятно</button>
        </div>
        : coachFeedback
          ? <div className="game-scoreboard advanced-training-v2-demo-stop" role="status">
            <div className="advanced-training-v2-demo-stop__heading">
              <img className="advanced-training-v2-demo-stop__avatar"
                src="/sprites/advanced-training-coach-avatar.webp" alt="Аватар Арсенича"
                width={42} height={42} />
              <span className="advanced-training-v2-demo-stop__title">Разбор броска</span>
            </div>
            <div className="advanced-training-v2-demo-stop__explanation">
              {coachFeedback.split('\n\n').map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
            <button type="button" className="btn btn--cta" onClick={() => {
              setCoachFeedback(null);
              setResumeHeldResultKey((value) => value + 1);
            }}>Понятно</button>
          </div>
        : phase === 'play'
          ? <div className={`game-scoreboard advanced-training-v2-cue${cueLabel === null
            ? ' advanced-training-v2-cue--waiting' : ''}`} role="status"
            aria-live="polite">{cueLabel ?? 'Ожидаем\nмомент'}</div>
          : undefined}
      onSceneClock={onSceneClock}
      clockRebaseKey={isDemo ? `${scenario.id}:${demoEpoch}` : `${run.run_id}:continuous`}
      initialSceneElapsedMs={isDemo ? scenario.sceneStartMs : run.resume_scene_ms}
      initialShooterElapsedMs={isDemo ? scenario.sceneStartMs : run.resume_scene_ms}
      onShotResolved={isDemo ? ({ input }) => {
        demoEvaluationRef.current = evaluateAdvancedTrainingV2Shot(demoScenario, {
          tapTime: input.tapTime,
          ...(input.shooterTapTime === undefined ? {} : { shooterTapTime: input.shooterTapTime }),
        });
        return null;
      } : undefined}
      onResultComplete={onResultComplete}
      waitForShotResponseBeforeResultClose
      holdSceneAfterResult={isDemo || phase === 'play'}
      resumeHeldResultKey={resumeHeldResultKey}
      preserveSceneOnModalReturn={phase === 'play' && resumeHeldResultKey > 0}
    />

    <AccessibleModal open={phase === 'intro'} title="Сначала – показ" onRequestClose={onCourse}
      cardClassName="advanced-training-v2-modal" beforeHeader={<DemoCoachModalAvatar />}>
      <p className="modal-copy">{exerciseKey === 'near_goalie'
        ? '– Посмотри как выполняется бросок, когда вратарь находится слева от ворот, а затем когда справа. Потом попробуй выполнить сам.'
        : '– Сначала посмотрите настоящий бросок слева и справа. Потом попробуете сами.'}</p>
      {error ? <p className="modal-copy" role="alert">{error}</p> : null}
      <div className="modal-actions"><button type="button" className="modal-primary btn btn--cta"
        onClick={() => startDemonstration('left')}>{exerciseKey === 'near_goalie'
          ? 'Показать: вратарь слева' : 'Показать слева'}</button></div>
    </AccessibleModal>

    <AccessibleModal open={phase === 'explanation'} title="Разбор ситуации" onRequestClose={onCourse}
      cardClassName="advanced-training-v2-modal" beforeHeader={<DemoCoachModalAvatar />}>
      <p className="modal-copy">– {explanation}</p>
      <div className="modal-actions">
        <button type="button" className="btn btn--ghost"
          onClick={() => startDemonstration(demoSide)}>Повторить показ</button>
        <button type="button" className="modal-primary btn btn--cta"
          onClick={() => {
            if (demoSide === 'left') startDemonstration('right');
            else setPhase('practice-intro');
          }}>{demoSide === 'left' ? exerciseKey === 'near_goalie'
            ? 'Показать: вратарь справа' : 'Показать справа' : 'Перейти к практике'}</button>
      </div>
    </AccessibleModal>

    <AccessibleModal open={phase === 'practice-intro'} title="Теперь твоя очередь" onRequestClose={onCourse}
      cardClassName="advanced-training-v2-modal" beforeHeader={<DemoCoachModalAvatar />}>
      <p className="modal-copy">– Сначала один правильный гол слева, затем один справа.</p>
      <div className="modal-actions"><button type="button" className="modal-primary btn btn--cta"
        onClick={() => setPhase('play')}>Начать практику</button></div>
    </AccessibleModal>

    <AccessibleModal open={phase === 'side-transition'} title="Смена стороны" onRequestClose={onCourse}
      cardClassName="advanced-training-v2-modal" beforeHeader={<DemoCoachModalAvatar />}>
      <p className="modal-copy">– Отлично! Теперь попробуй {run.side === 'right' ? 'справа' : 'слева'}.</p>
      <div className="modal-actions"><button type="button" className="modal-primary btn btn--cta"
        onClick={() => { setFeedback(null); setCueLabel(null);
          setResumeHeldResultKey((value) => value + 1); setPhase('play'); }}>
        Продолжить
      </button></div>
    </AccessibleModal>

    <AccessibleModal open={phase === 'practice-finished'} title="Практика завершена" onRequestClose={onCourse}
      cardClassName="advanced-training-v2-modal" beforeHeader={<DemoCoachModalAvatar />}>
      <p className="modal-copy">– По одному правильному голу с каждой стороны. Теперь зачёт: по два с каждой стороны, без подсказок.</p>
      <div className="modal-actions"><button type="button" className="modal-primary btn btn--cta"
        onClick={() => void startAdvancedTrainingV2Assessment(exerciseKey, run.run_id)
          .then(({ state }) => { applyState(state); setFeedback(null); setCueLabel(null);
            setResumeHeldResultKey((value) => value + 1); setPhase('play'); })
          .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Не удалось начать зачёт'))}>
        Начать зачёт
      </button></div>
    </AccessibleModal>

    <AccessibleModal open={phase === 'completed'} title="Упражнение пройдено" onRequestClose={onCourse}
      cardClassName="advanced-training-v2-modal" beforeHeader={<DemoCoachModalAvatar />}>
      <p className="modal-copy">– По два правильных гола слева и справа.
        {reward ? ` Награда: ${reward.stars} звезда и ${reward.experience} опыт.` : ' Награда уже получена.'}</p>
      <div className="modal-actions"><button type="button" className="modal-primary btn btn--cta"
        onClick={onCourse}>К упражнениям</button></div>
    </AccessibleModal>
  </>;
}
