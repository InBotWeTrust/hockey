import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GOAL, GOALIE_Y, GOAL_OPENING, PUCK_START, RINK,
  PERSPECTIVE_COURT_GOALIE_VISUAL_Y_OFFSET, PERSPECTIVE_COURT_GOAL_VISUAL_Y_OFFSET,
  PERSPECTIVE_COURT_VISUAL_X_CENTER, PERSPECTIVE_COURT_VISUAL_Y_OFFSET,
  PERSPECTIVE_COURT_VISUAL_Y_SCALE,
  getAdvancedTrainingV2Scenario, getGoalie,
  getAdvancedTrainingEpisode, sampleAdvancedTrainingEpisode,
  evaluateAdvancedTrainingEpisodeShot, validateAdvancedTrainingEpisode,
  getAdvancedTrainingContinuousSeed, deriveShotSeed,
  type AdvancedTrainingV2Scenario,
  type AdvancedTrainingV2Side, type AdvancedTrainingV2Technique } from '@hockey/game-core';
import { startAdvancedTrainingV2Exercise, type AdvancedTrainingV2RunState } from '../api/advancedTraining.js';
import { startAdvancedTrainingV2Assessment, startAdvancedTrainingV2Episode, submitAdvancedTrainingV2Shot,
  type AdvancedTrainingV2ShotResponse } from '../api/advancedTraining.js';
import { PlayView, TRAINING_AMATEUR_GOALIE_OPTIONS, TRAINING_COURSE_GOAL_OPTIONS,
  TRAINING_STREET_PLAYER_OPTIONS, type PlayShotResolver } from '../game/PlayView.js';
import { TRAINING_LONG_COURT_BACKGROUND } from '../game/trainingNewCourt.js';
import { AccessibleModal } from './AccessibleModal.js';
import { ADVANCED_TRAINING_V2_TITLES, getAdvancedTrainingV2Explanation,
  getAdvancedTrainingV2FailureExplanation, getAdvancedTrainingV2StopHint,
  type TrainingMotionDirection } from './AdvancedTrainingV2Explanation.js';
import { getAdvancedTrainingEpisodeCue } from './advancedTrainingV2Timing.js';

type Phase = 'intro' | 'demo' | 'explanation' | 'practice-intro' | 'play' |
  'practice-finished' | 'completed' | 'timeout' | 'hint' | 'resetting';

type DemoDirectionMarker = { name: string; x: number; y: number;
  direction: TrainingMotionDirection; color: string };

type DemoFuturePreview = { goalX: number; goalY: number; goalieX: number; goalieY: number;
  goalDirection: TrainingMotionDirection; goalieDirection: TrainingMotionDirection };

function getContinuousDemoScenario(technique: AdvancedTrainingV2Technique,
  side: AdvancedTrainingV2Side): AdvancedTrainingV2Scenario {
  const base = getAdvancedTrainingV2Scenario(technique, side, 'demonstration', 0);
  const episode = getAdvancedTrainingEpisode(technique, side);
  validateAdvancedTrainingEpisode(episode);
  const sessionSeed = getAdvancedTrainingContinuousSeed(technique);
  return { ...base, sessionSeed, shotSeed: deriveShotSeed(sessionSeed, 1, 1),
    sceneStartMs: episode.sceneStartMs,
    targetTapTimeMs: episode.intervalStartMs + 250 };
}

function getDemoFuturePreview(scenario: AdvancedTrainingV2Scenario): DemoFuturePreview {
  const episode = getAdvancedTrainingEpisode(scenario.technique, scenario.side);
  const goalFlightMs = (PUCK_START.y - GOAL_OPENING.y) / episode.puckSpeedPerMs;
  const goalieFlightMs = (PUCK_START.y - GOALIE_Y) / episode.puckSpeedPerMs;
  const goalAt = scenario.targetTapTimeMs + goalFlightMs;
  const goalieAt = scenario.targetTapTimeMs + goalieFlightMs;
  const goal = sampleAdvancedTrainingEpisode(episode, goalAt);
  const goalie = sampleAdvancedTrainingEpisode(episode, goalieAt);
  return {
    goalX: PERSPECTIVE_COURT_VISUAL_X_CENTER + goal.goalOffsetX,
    goalY: (GOAL.y + GOAL.height) * (TRAINING_COURSE_GOAL_OPTIONS.visualYScale ?? 1) +
      (TRAINING_COURSE_GOAL_OPTIONS.visualYOffset ?? 0),
    goalieX: goalie.goalieX,
    goalieY: GOALIE_Y * (TRAINING_AMATEUR_GOALIE_OPTIONS.visualYScale ?? 1) +
      (TRAINING_AMATEUR_GOALIE_OPTIONS.visualYOffset ?? 0),
    goalDirection: goal.goalDirection < 0 ? 'left' : 'right',
    goalieDirection: goalie.goalieDirection < 0 ? 'left' : 'right',
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
  const frame = sampleAdvancedTrainingEpisode(
    getAdvancedTrainingEpisode(scenario.technique, scenario.side), t);
  const direction = (value: -1 | 1): TrainingMotionDirection => value < 0 ? 'left' : 'right';
  return [
    { name: 'Игрок', x: frame.playerX,
      y: PUCK_START.y * PERSPECTIVE_COURT_VISUAL_Y_SCALE + PERSPECTIVE_COURT_VISUAL_Y_OFFSET,
      direction: direction(frame.playerDirection), color: '#3b82f6' },
    { name: 'Ворота',
      x: PERSPECTIVE_COURT_VISUAL_X_CENTER + frame.goalOffsetX,
      y: (GOAL.y + GOAL.height) * PERSPECTIVE_COURT_VISUAL_Y_SCALE +
        PERSPECTIVE_COURT_GOAL_VISUAL_Y_OFFSET - 70,
      direction: direction(frame.goalDirection), color: '#22c55e' },
    { name: 'Вратарь',
      x: frame.goalieX,
      y: GOALIE_Y * PERSPECTIVE_COURT_VISUAL_Y_SCALE +
        PERSPECTIVE_COURT_GOALIE_VISUAL_Y_OFFSET + 66,
      direction: direction(frame.goalieDirection), color: '#ef4444' },
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
  const [displaySide, setDisplaySide] = useState<AdvancedTrainingV2Side>('left');
  const [demoEpoch, setDemoEpoch] = useState(0);
  const [demoReady, setDemoReady] = useState(false);
  const [demoShotTrigger, setDemoShotTrigger] = useState(0);
  const [demoFired, setDemoFired] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restartNotice, setRestartNotice] = useState(false);
  const [coachFeedback, setCoachFeedback] = useState<string | null>(null);
  const [resumeHeldResultKey, setResumeHeldResultKey] = useState(0);
  const [cueLabel, setCueLabel] = useState<string | null>('Ожидаем\nмомент');
  const [replayEpoch, setReplayEpoch] = useState(0);
  const [nextPhase, setNextPhase] = useState<Phase>('play');
  const [reward, setReward] = useState<{ stars: number; experience: number } | null>(null);
  const demoEvaluationRef = useRef<ReturnType<typeof evaluateAdvancedTrainingEpisodeShot> | null>(null);
  const pendingOutcomeRef = useRef<AdvancedTrainingV2ShotResponse | null>(null);
  const submittedSideRef = useRef<AdvancedTrainingV2Side | null>(null);
  const shotPendingRef = useRef(false);
  const timeoutPendingRef = useRef(false);
  const runRef = useRef<AdvancedTrainingV2RunState | null>(null);
  runRef.current = run;
  const applyState = useCallback((state: AdvancedTrainingV2RunState) => {
    if (runRef.current && state.run_id === runRef.current.run_id &&
      state.shot_index < runRef.current.shot_index) return;
    runRef.current = state;
    setRun(state);
  }, []);
  const beginEpisode = useCallback(async (state: AdvancedTrainingV2RunState) => {
    setPhase('resetting');
    try {
      const started = await startAdvancedTrainingV2Episode(exerciseKey,
        state.run_id, state.movement_id);
      if (runRef.current?.run_id !== state.run_id) return;
      applyState(started.state);
      window.requestAnimationFrame(() => {
        setDisplaySide(started.state.side);
        setReplayEpoch((value) => value + 1);
        setResumeHeldResultKey((value) => value + 1);
        setCueLabel('Ожидаем\nмомент');
        window.requestAnimationFrame(() => setPhase('play'));
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось начать попытку');
    }
  }, [applyState, exerciseKey]);
  const startRequestRef = useRef<{ key: AdvancedTrainingV2Technique;
    request: ReturnType<typeof startAdvancedTrainingV2Exercise> } | null>(null);

  useEffect(() => {
    let active = true;
    if (startRequestRef.current?.key !== exerciseKey) {
      startRequestRef.current = { key: exerciseKey,
        request: startAdvancedTrainingV2Exercise(exerciseKey) };
    }
    void startRequestRef.current.request.then(({ state, restarted_due_to_version }) => {
      if (!active) return;
      applyState(state);
      setDisplaySide(state.side);
      setRestartNotice(Boolean(restarted_due_to_version));
      if (state.stage === 'practice' && state.side_successes.left >= 1 &&
        state.side_successes.right >= 1) setPhase('practice-finished');
      else if (state.shot_index > 0 || state.stage === 'assessment') void beginEpisode(state);
      else setPhase('intro');
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Не удалось начать упражнение');
    });
    return () => { active = false; };
  }, [applyState, beginEpisode, exerciseKey]);

  const demoScenario = useMemo(() => getContinuousDemoScenario(exerciseKey, demoSide),
    [exerciseKey, demoSide]);
  const demoEpisode = useMemo(() => getAdvancedTrainingEpisode(exerciseKey, demoSide),
    [exerciseKey, demoSide]);
  const playEpisode = useMemo(() => getAdvancedTrainingEpisode(exerciseKey, displaySide),
    [exerciseKey, displaySide]);
  const episode = phase === 'demo' || phase === 'explanation' ? demoEpisode :
    playEpisode;
  const scenario: AdvancedTrainingV2Scenario | null = phase === 'demo' || phase === 'explanation'
    ? demoScenario : run?.scenario ?? null;
  const validatedDemo = useMemo(() => evaluateAdvancedTrainingEpisodeShot(demoEpisode,
    demoScenario.targetTapTimeMs), [demoEpisode, demoScenario]);
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
    puckSpeed: episode.puckSpeedPerMs,
  } : undefined;

  const shotResolver: PlayShotResolver = useCallback((context) =>
    evaluateAdvancedTrainingEpisodeShot(episode, context.input.tapTime).result, [episode]);

  const startDemonstration = useCallback((side: AdvancedTrainingV2Side) => {
    const selected = getContinuousDemoScenario(exerciseKey, side);
    const validation = evaluateAdvancedTrainingEpisodeShot(
      getAdvancedTrainingEpisode(exerciseKey, side), selected.targetTapTimeMs);
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
    if (outcome.completed) {
      setReward(outcome.reward_granted);
      onCatalogRefresh(exerciseKey);
      setNextPhase('completed');
    } else if (outcome.stage_finished && outcome.state.stage === 'practice') {
      setNextPhase('practice-finished');
    } else {
      setNextPhase('play');
    }
    let hint: string;
    if (outcome.server_result === 'goal' && !outcome.success) {
      hint = getAdvancedTrainingV2FailureExplanation(run!.scenario,
        outcome.actual_technique, outcome.measurements);
    } else if (outcome.success) {
      hint = outcome.completed
        ? '– Получился нужный гол. Ты выполнил обе стороны и прошёл упражнение.\n\nПосмотри итог и награду.'
        : outcome.stage_finished
          ? '– Получился нужный гол. Практика завершена с обеих сторон.\n\nТеперь переходи к зачёту.'
          : submittedSideRef.current !== outcome.state.side
        ? `– Получился нужный гол. Эта сторона пройдена.\n\nТеперь попробуй ${outcome.state.side === 'left' ? 'слева' : 'справа'} от ворот.`
        : `– Получился нужный гол. Ты выбрал правильный момент.\n\nПовтори бросок в следующем эпизоде.`;
    } else if (outcome.server_result === 'save') {
      hint = '– Получился сэйв: шайба пришла туда, где стоял вратарь.\n\nДождись свободного прохода между вратарём и штангой.';
    } else {
      hint = '– Шайба прошла мимо ворот: в момент прилёта створ был в стороне.\n\nДождись, когда игрок окажется напротив открытой части ворот.';
    }
    setCoachFeedback(hint);
    setCueLabel(null);
    setPhase('hint');
  }, [demoScenario, exerciseKey, onCatalogRefresh, phase, run?.side, validatedDemo]);

  const onSceneClock = useCallback((sceneMs: number) => {
    if (phase === 'demo') {
      if (sceneMs >= demoScenario.targetTapTimeMs && !demoFired) setDemoReady(true);
      return;
    }
    if (phase !== 'play' || !run || shotPendingRef.current) return;
    const cue = getAdvancedTrainingEpisodeCue(episode, sceneMs, run.stage);
    setCueLabel(cue.shootNow ? 'Бросай'
      : cue.secondsRemaining === null
        ? run.stage === 'practice' || sceneMs < episode.intervalStartMs - 4000
          ? 'Ожидаем\nмомент' : null
        : String(cue.secondsRemaining));
    if (!cue.expired) {
      timeoutPendingRef.current = false;
      return;
    }
    if (shotPendingRef.current || timeoutPendingRef.current) return;
    timeoutPendingRef.current = true;
    setCueLabel(null);
    setPhase('timeout');
  }, [demoFired, demoScenario.targetTapTimeMs, episode, phase, run]);

  if (!run || !scenario || !speedOverrides) {
    return <main className="screen initial-training-play-state" role={error ? 'alert' : undefined}>
      {error ?? 'Готовим упражнение…'}
      {error ? <button type="button" className="btn btn--ghost" onClick={onCourse}>К упражнениям</button> : null}
    </main>;
  }

  const isDemo = phase === 'demo' || phase === 'explanation';
  const active = phase === 'demo' || phase === 'explanation' || phase === 'play' || phase === 'timeout' ||
    phase === 'hint' || phase === 'resetting';
  const showModal = !active;

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
      primaryActionBlocked={phase !== 'play' || Boolean(coachFeedback)}
      hitboxesVisible={false}
      maxSceneTimeMs={phase === 'demo' && !demoFired ? demoScenario.targetTapTimeMs : undefined}
      shotTriggerKey={demoShotTrigger}
      sceneTimeScale={phase === 'explanation' || phase === 'timeout' || phase === 'hint' || phase === 'resetting'
        ? () => 0 : undefined}
      episodeSampler={(sceneMs) => sampleAdvancedTrainingEpisode(episode, sceneMs)}
      backLabel="К упражнениям"
      optimisticAddShot={() => undefined}
      submitShot={async ({ input, claimedResult }) => {
        if (isDemo) return { serverResult: claimedResult, state: run, isCurrent: () => true };
        shotPendingRef.current = true;
        submittedSideRef.current = run.side;
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
      statusNotice={error ?? (isDemo
        ? exerciseKey === 'near_goalie'
          ? `Ситуация "Вратарь рядом"\nВратарь ${demoSide === 'left' ? 'слева' : 'справа'} от ворот`
          : `Ситуация "${ADVANCED_TRAINING_V2_TITLES[exerciseKey]}"\nПоказ ${demoSide === 'left' ? 'слева' : 'справа'}`
        : practiceSideNotice(exerciseKey, displaySide))}
      statusNoticeTone={error ? 'error' : undefined}
      statusNoticeUnderScoreboard
      overlayControlsTop={phase === 'demo' && demoReady && !demoFired || coachFeedback
        ? '49%' : phase === 'play' ? '53%' : undefined}
      overlayControlsCentered={(phase === 'demo' && demoReady && !demoFired) ||
        Boolean(coachFeedback) || phase === 'play'}
      rinkOverlay={phase === 'demo' && demoReady && !demoFired
        ? <DemoDirectionOverlay markers={demoDirections} preview={demoFuturePreview} /> : undefined}
      rinkCover={phase === 'resetting' ? <div className="advanced-training-v2-reset-cover"
        aria-label="Подготовка следующей попытки" /> : undefined}
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
              if (nextPhase !== 'play') {
                setPhase(nextPhase);
                return;
              }
              void beginEpisode(runRef.current ?? run);
            }}>Понятно</button>
          </div>
        : phase === 'play' && cueLabel !== null
          ? <div className={`game-scoreboard advanced-training-v2-cue${cueLabel === 'Ожидаем\nмомент'
            ? ' advanced-training-v2-cue--waiting' : ''}`} role="status"
            aria-live="polite">{cueLabel}</div>
          : undefined}
      onSceneClock={onSceneClock}
      clockRebaseKey={isDemo ? `${scenario.id}:${demoEpoch}` : `${run.run_id}:${replayEpoch}`}
      initialSceneElapsedMs={isDemo ? scenario.sceneStartMs : 0}
      initialShooterElapsedMs={isDemo ? scenario.sceneStartMs : 0}
      onShotResolved={isDemo ? ({ input }) => {
        demoEvaluationRef.current = evaluateAdvancedTrainingEpisodeShot(demoEpisode, input.tapTime);
        return null;
      } : undefined}
      onResultComplete={onResultComplete}
      waitForShotResponseBeforeResultClose
      holdSceneAfterResult={isDemo || phase === 'play'}
      resumeHeldResultKey={resumeHeldResultKey}
      preserveSceneOnModalReturn={phase === 'play' || phase === 'hint' ||
        phase === 'timeout' || phase === 'resetting'}
    />

    <AccessibleModal open={phase === 'intro'} title="Сначала – показ" onRequestClose={onCourse}
      cardClassName="advanced-training-v2-modal" beforeHeader={<DemoCoachModalAvatar />}>
      <p className="modal-copy">{exerciseKey === 'near_goalie'
        ? '– Посмотри как выполняется бросок, когда вратарь находится слева от ворот, а затем когда справа. Потом попробуй выполнить сам.'
        : '– Сначала посмотрите настоящий бросок слева и справа. Потом попробуете сами.'}</p>
      {restartNotice ? <p className="modal-copy">– Правила упражнения обновились. Начни эту попытку заново; уже пройденные упражнения сохранены.</p> : null}
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

    <AccessibleModal open={phase === 'timeout'} title="Момент упущен"
      onRequestClose={() => { setCoachFeedback(
        '– Ты не бросил, пока проход к воротам был открыт.\n\nДождись следующего отсчёта и нажми «Бросок» в нужный момент.');
        setNextPhase('play'); setPhase('hint'); }}
      cardClassName="advanced-training-v2-modal" beforeHeader={<DemoCoachModalAvatar />}>
      <p className="modal-copy">– Окно для броска прошло. Бросок не засчитан.</p>
      <div className="modal-actions"><button type="button" className="modal-primary btn btn--cta"
        onClick={() => { setCoachFeedback(
          '– Ты не бросил, пока проход к воротам был открыт.\n\nДождись следующего отсчёта и нажми «Бросок» в нужный момент.');
          setNextPhase('play'); setPhase('hint'); }}>Продолжить</button></div>
    </AccessibleModal>

    <AccessibleModal open={phase === 'practice-intro'} title="Теперь твоя очередь" onRequestClose={onCourse}
      cardClassName="advanced-training-v2-modal" beforeHeader={<DemoCoachModalAvatar />}>
      <p className="modal-copy">– Сначала один правильный гол слева, затем один справа.</p>
      <div className="modal-actions"><button type="button" className="modal-primary btn btn--cta"
        onClick={() => void beginEpisode(run)}>Начать практику</button></div>
    </AccessibleModal>

    <AccessibleModal open={phase === 'practice-finished'} title="Практика завершена" onRequestClose={onCourse}
      cardClassName="advanced-training-v2-modal" beforeHeader={<DemoCoachModalAvatar />}>
      <p className="modal-copy">– По одному правильному голу с каждой стороны. Теперь зачёт: по два с каждой стороны. Отсчёт предупредит о моменте, а когда бросать – решай сам.</p>
      <div className="modal-actions"><button type="button" className="modal-primary btn btn--cta"
        onClick={() => void startAdvancedTrainingV2Assessment(exerciseKey, run.run_id)
          .then(({ state }) => { applyState(state); void beginEpisode(state); })
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
