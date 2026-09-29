import { useCallback, useEffect, useRef, useState } from 'react';
import { getDailyPeriodSpeedPreset, getGoalie, GOAL_OPENING,
  PERSPECTIVE_COURT_GOAL_VISUAL_OFFSET_X_SCALE, PUCK_START, RINK,
  sampleOpenWindowScene, type ObservationEvaluation, type ObservationScene,
  type ObservationStepKey } from '@hockey/game-core';
import { startObservationAttempt, startObservationStep, submitObservationDecision,
  type ObservationDecisionResponse, type ObservationRunState } from '../api/openWindowTraining.js';
import { PlayView, TRAINING_AMATEUR_GOALIE_OPTIONS, TRAINING_COURSE_GOAL_OPTIONS,
  TRAINING_STREET_PLAYER_OPTIONS } from '../game/PlayView.js';
import { TRAINING_LONG_COURT_BACKGROUND } from '../game/trainingNewCourt.js';
import { AccessibleModal } from './AccessibleModal.js';
import { sampleRecordedObservation } from './recordedObservation.js';

type Phase = 'intro' | 'starting' | 'playing' | 'paused' | 'submitting' | 'review' |
  'retry' | 'feedback' | 'complete';
type DecisionInput = { type: 'classify'; answer: 'open' | 'closed' } |
  { type: 'mark'; tap_time_ms: number } | { type: 'skip' } | { type: 'observed' };

const preset = getDailyPeriodSpeedPreset(1);
const speedOverrides = { shooterFreq: preset.shooterFrequency,
  goalieFreq: preset.goalieFrequency, goalFreq: preset.goalFrequency,
  puckSpeed: preset.puckSpeedPerMs };

const feedbackCopy: Record<ObservationEvaluation, string> = {
  observed: 'Вратарь сместился, и появился путь к воротам. Не обязательно попасть – важно его заметить.',
  good_mark: 'Да, путь к воротам был открыт. Ты заметил шанс.',
  early: 'Пока рано: путь к воротам ещё закрыт. Следи за движением игрока и ворот.',
  late: 'Просвет уже закрылся. В следующий раз отмечай его чуть раньше.',
  closed: 'Сейчас путь к воротам закрыт. Лучше подождать.',
  good_skip: 'Правильно подождал: свободного пути не было.',
  missed_opening: 'Здесь путь ненадолго открылся. Посмотри повтор и отметь похожий момент дальше.',
};

function DecisionPath({ scene, animatePuck = false }: {
  scene: ObservationScene; animatePuck?: boolean;
}): JSX.Element {
  const recorded = sampleRecordedObservation(scene, scene.decisionMs);
  const frame = recorded?.motion ?? sampleOpenWindowScene({ ...scene, targetMs: scene.decisionMs },
    scene.decisionMs);
  const goalX = (GOAL_OPENING.xMin + GOAL_OPENING.xMax) / 2 +
    frame.goalOffsetX * (recorded ? 1 : PERSPECTIVE_COURT_GOAL_VISUAL_OFFSET_X_SCALE);
  const shooterX = recorded?.motion.playerX ?? ('shooterX' in frame ? frame.shooterX : 0);
  return <svg aria-hidden="true" viewBox={`0 0 ${RINK.width} ${RINK.height}`}
    preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', inset: 0,
      width: '100%', height: '100%', pointerEvents: 'none' }}>
    <line x1={shooterX} y1={PUCK_START.y - 30}
      x2={shooterX} y2={GOAL_OPENING.y}
      stroke={scene.opening ? '#69D8FF' : '#FFFFFF'} strokeWidth="3"
      strokeDasharray="9 7" opacity="0.8" />
    <circle cx={goalX} cy={GOAL_OPENING.y} r="17" fill="none"
      stroke="#FFFFFF" strokeWidth="2" opacity="0.7" />
    {animatePuck ? <circle cx={shooterX} cy={PUCK_START.y - 30} r="6"
      fill="#FFFFFF" stroke="#1466a3" strokeWidth="2">
      <animate attributeName="cy" from={PUCK_START.y - 30} to={GOAL_OPENING.y}
        dur="0.55s" begin="0.2s" fill="freeze" />
    </circle> : null}
  </svg>;
}

function CoachCard({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="game-scoreboard advanced-training-v2-demo-stop" role="status">
    <div className="advanced-training-v2-demo-stop__heading">
      <img className="advanced-training-v2-demo-stop__avatar"
        src="/sprites/advanced-training-coach-avatar.webp" alt="Аватар Арсенича"
        width={42} height={42} />
      <span className="advanced-training-v2-demo-stop__title">Посмотри на путь к воротам</span>
    </div>
    {children}
  </div>;
}

export function OpenWindowObservationPlay({ stepKey, onBack, onCatalogRefresh }: {
  stepKey: ObservationStepKey;
  onBack: () => void;
  onCatalogRefresh: () => void;
}): JSX.Element {
  const [run, setRun] = useState<ObservationRunState | null>(null);
  const runRef = useRef<ObservationRunState | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [feedback, setFeedback] = useState<ObservationEvaluation | null>(null);
  const [decisionCompleted, setDecisionCompleted] = useState(false);
  const [explainedScene, setExplainedScene] = useState<ObservationScene | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replayKey, setReplayKey] = useState(0);
  const pendingRef = useRef(false);
  const retryInputRef = useRef<DecisionInput | null>(null);

  const applyState = useCallback((next: ObservationRunState) => {
    if (runRef.current?.run_id === next.run_id &&
      next.decision_index < runRef.current.decision_index) return;
    runRef.current = next;
    setRun(next);
  }, []);

  useEffect(() => {
    let mounted = true;
    void startObservationStep(stepKey).then(({ state, restarted_due_to_version }) => {
      if (!mounted) return;
      applyState(state);
      if (restarted_due_to_version) setError('Правила обновились. Начни урок заново.');
    }).catch(() => { if (mounted) setError('Не удалось открыть упражнение.'); });
    return () => { mounted = false; };
  }, [applyState, stepKey]);

  const beginAttempt = useCallback(async (current: ObservationRunState) => {
    setPhase('starting');
    setError(null);
    try {
      const response = await startObservationAttempt(stepKey, current.run_id);
      if (runRef.current?.run_id !== current.run_id) return;
      applyState(response.state);
      pendingRef.current = false;
      setExplainedScene(null);
      setReplayKey((value) => value + 1);
      setPhase('playing');
    } catch {
      setError('Не удалось начать сцену. Попробуй ещё раз.');
      setPhase('intro');
    }
  }, [applyState, stepKey]);

  const submit = useCallback(async (input: DecisionInput) => {
    const current = runRef.current;
    if (!current || pendingRef.current) return;
    pendingRef.current = true;
    retryInputRef.current = input;
    setExplainedScene(current.scene);
    setPhase('submitting');
    try {
      const response: ObservationDecisionResponse = await submitObservationDecision(stepKey, {
        run_id: current.run_id, attempt_token: current.attempt_token,
        decision_index: current.decision_index + 1, scene_id: current.scene.id, input,
      });
      if (runRef.current?.run_id !== current.run_id) return;
      applyState(response.state);
      setFeedback(response.observation_feedback);
      setDecisionCompleted(response.completed);
      setError(null);
      if (stepKey === 'notice_frame') setPhase('feedback');
      else {
        setReplayKey((value) => value + 1);
        setPhase('review');
      }
      if (response.completed) onCatalogRefresh();
    } catch {
      setError('Не удалось сохранить выбор. Повтори отправку – момент останется тем же.');
      setPhase('retry');
    } finally { pendingRef.current = false; }
  }, [applyState, onCatalogRefresh, stepKey]);

  const onSceneClock = useCallback((sceneMs: number) => {
    const current = runRef.current;
    if (phase === 'review' && explainedScene &&
      sceneMs >= explainedScene.decisionMs - 8) {
      setPhase('feedback');
      return;
    }
    if (!current || phase !== 'playing') return;
    if (stepKey === 'notice_independent') {
      if (sceneMs >= current.scene.endMs - 8 && !pendingRef.current) {
        void submit({ type: 'skip' });
      }
    } else if (sceneMs >= current.scene.decisionMs - 8) {
      setPhase('paused');
    }
  }, [explainedScene, phase, stepKey, submit]);

  const scene = explainedScene && (phase === 'submitting' || phase === 'review' || phase === 'retry' ||
    phase === 'feedback' || phase === 'starting' || phase === 'complete')
    ? explainedScene : run?.scene;
  if (!run || !scene) return <main className="screen initial-training-play-state"
    role={error ? 'alert' : undefined}>{error ?? 'Готовим упражнение…'}
    {error ? <button type="button" className="btn btn--ghost" onClick={onBack}>
      К упражнениям</button> : null}</main>;

  const isPaused = phase === 'paused' || phase === 'feedback' || phase === 'retry' ||
    phase === 'submitting' || phase === 'starting';
  const replayStartMs = Math.max(scene.startMs, scene.decisionMs - 1000);
  const initialSceneMs = phase === 'review' ? replayStartMs :
    phase === 'feedback' ? scene.decisionMs :
      scene.startMs + run.active_elapsed_ms;
  const overlayControls = phase === 'paused' ? <CoachCard>
    {stepKey === 'notice_frame' ? <>
      <p className="advanced-training-v2-demo-stop__explanation">– {scene.explanation} Не обязательно попасть – важно заметить шанс.</p>
      <button type="button" className="btn btn--cta" onClick={() => void submit({ type: 'observed' })}>
        Понятно</button></> : <>
      <p className="advanced-training-v2-demo-stop__explanation">– Есть ли сейчас свободный путь к воротам?</p>
      <button type="button" className="btn btn--cta"
        onClick={() => void submit({ type: 'classify', answer: 'open' })}>Можно бросить</button>
      <button type="button" className="btn btn--ghost"
        onClick={() => void submit({ type: 'classify', answer: 'closed' })}>Лучше подождать</button>
    </>}
  </CoachCard> : phase === 'feedback' && feedback ? <CoachCard>
    <p className="advanced-training-v2-demo-stop__explanation">– {feedbackCopy[feedback]}</p>
    <button type="button" className="btn btn--cta" onClick={() => {
      setFeedback(null);
      if (decisionCompleted) setPhase('complete');
      else void beginAttempt(runRef.current ?? run);
    }}>Понятно</button>
  </CoachCard> : phase === 'retry' ? <CoachCard>
    <p className="advanced-training-v2-demo-stop__explanation">– {error}</p>
    <button type="button" className="btn btn--cta" onClick={() => {
      if (retryInputRef.current) void submit(retryInputRef.current);
    }}>Повторить отправку</button>
  </CoachCard> : undefined;

  return <>
    <PlayView<ObservationRunState>
      suppressedByModal={phase === 'intro' || phase === 'complete'}
      showIceCar={false} onBack={onBack} active={phase !== 'intro' && phase !== 'complete'}
      seed={scene.sessionSeed} goalieId={scene.goalieId}
      goalieConfig={getGoalie(scene.goalieId)} periodNumber={1}
      periodLabel="УПРАЖНЕНИЯ" scoreboardPeriodNumber={1} scoreboardPeriodsTotal={12}
      speedOverrides={speedOverrides} goals={0} shots={0}
      sceneShotIndex={scene.shotIndex} timer="Наблюдение" timerLabel="НАБЛЮДЕНИЕ"
      episodeSampler={scene.source === 'recorded'
        ? (wallMs) => {
          const sample = sampleRecordedObservation(scene, wallMs);
          if (!sample) throw new Error(`Missing recorded observation: ${scene.id}`);
          return sample.motion;
        } : undefined}
      hidePrimaryAction={stepKey !== 'notice_independent'}
      shotButtonLabel="ВИЖУ ШАНС" primaryActionBlocked={phase !== 'playing'}
      observationAction={stepKey === 'notice_independent'
        ? (sceneMs) => void submit({ type: 'mark', tap_time_ms: sceneMs }) : undefined}
      maxSceneTimeMs={phase === 'review' ? scene.decisionMs :
        stepKey === 'notice_independent' ? scene.endMs : scene.decisionMs}
      sceneTimeScale={isPaused ? () => 0 : undefined}
      backLabel="К упражнениям" optimisticAddShot={() => undefined}
      submitShot={async () => null} applyState={applyState}
      onSceneClock={onSceneClock} hitboxesVisible={false}
      longCourtBackground={TRAINING_LONG_COURT_BACKGROUND}
      playerOptions={TRAINING_STREET_PLAYER_OPTIONS}
      goalOptions={TRAINING_COURSE_GOAL_OPTIONS}
      goalieOptions={TRAINING_AMATEUR_GOALIE_OPTIONS}
      overlayControls={overlayControls} overlayControlsCentered={Boolean(overlayControls)}
      overlayControlsTop="49%"
      rinkOverlay={phase === 'paused' && stepKey === 'notice_frame'
        ? <DecisionPath scene={scene} animatePuck />
        : explainedScene && phase === 'feedback'
          ? <DecisionPath scene={explainedScene} /> : undefined}
      clockRebaseKey={`${scene.id}:${replayKey}`}
      initialSceneElapsedMs={initialSceneMs}
      initialShooterElapsedMs={initialSceneMs}
    />
    <AccessibleModal open={phase === 'intro'} title={stepKey === 'notice_frame'
      ? 'Сначала – показ' : stepKey === 'notice_motion' ? 'Открыто или закрыто' : 'Узнай в игре'}
      onRequestClose={onBack} cardClassName="advanced-training-v2-modal"
      beforeHeader={<img className="advanced-training-v2-modal__avatar"
        src="/sprites/advanced-training-coach-modal.webp" alt="Аватар Арсенича"
        width={44} height={44} />}>
      <p className="modal-copy">– {stepKey === 'notice_frame'
        ? 'Посмотри, как открывается путь от игрока к воротам.'
        : stepKey === 'notice_motion'
          ? 'Когда сцена остановится, реши: путь открыт или лучше подождать.'
          : 'Смотри настоящий игровой эпизод. Увидишь шанс – отметь его, иначе подожди.'}</p>
      <div className="modal-actions"><button type="button" className="modal-primary btn btn--cta"
        onClick={() => void beginAttempt(run)}>{stepKey === 'notice_frame' ? 'Начать показ' : 'Начать'}</button></div>
    </AccessibleModal>
    <AccessibleModal open={phase === 'complete'} title="Урок пройден"
      onRequestClose={onBack} cardClassName="advanced-training-v2-modal">
      <p className="modal-copy">– Ты учишься замечать путь к воротам. Переходи к следующему шагу.</p>
      <div className="modal-actions"><button type="button" className="modal-primary btn btn--cta"
        onClick={onBack}>К упражнениям</button></div>
    </AccessibleModal>
  </>;
}
