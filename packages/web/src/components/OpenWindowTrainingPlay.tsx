import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDailyPeriodSpeedPreset, getGoalie, OPEN_WINDOW_STEPS,
  resolveOpenWindowShot, sampleOpenWindowScene,
  type CuratedOpenWindowScene, type OpenWindowStepKey } from '@hockey/game-core';
import { startOpenWindowAttempt, startOpenWindowStep,
  submitOpenWindowDecision, finishOpenWindowSeries,
  type OpenWindowDecisionResponse, type OpenWindowRunState } from '../api/openWindowTraining.js';
import { PlayView, TRAINING_AMATEUR_GOALIE_OPTIONS,
  TRAINING_COURSE_GOAL_OPTIONS, TRAINING_STREET_PLAYER_OPTIONS,
  type PlayShotResolver } from '../game/PlayView.js';
import { TRAINING_LONG_COURT_BACKGROUND } from '../game/trainingNewCourt.js';
import { AccessibleModal } from './AccessibleModal.js';

type Phase = 'intro' | 'demo' | 'demo-stop' | 'demo-shot' | 'demo-review' |
  'practice-intro' | 'starting' | 'play' | 'feedback' | 'complete';
type Feedback = { heading: string; paragraphs: string[] };

const speeds = getDailyPeriodSpeedPreset(1);
const speedOverrides = {
  shooterFreq: speeds.shooterFrequency,
  goalieFreq: speeds.goalieFrequency,
  goalFreq: speeds.goalFrequency,
  puckSpeed: speeds.puckSpeedPerMs,
};

function movementLabel(delta: number): string {
  return delta > 0 ? 'вправо' : 'влево';
}

function demonstrationCopy(scene: CuratedOpenWindowScene): string {
  const before = sampleOpenWindowScene(scene, scene.targetMs - 180);
  const now = sampleOpenWindowScene(scene, scene.targetMs);
  return `Игрок движется ${movementLabel(now.shooterX - before.shooterX)}, ` +
    `ворота – ${movementLabel(now.goalOffsetX - before.goalOffsetX)}, ` +
    `вратарь – ${movementLabel(now.goalieX - before.goalieX)}. ` +
    'На этом проходе путь к воротам открыт. Заметь взаимное положение всех троих.';
}

function feedbackFor(response: OpenWindowDecisionResponse): Feedback {
  const { evaluation } = response;
  if (evaluation.opportunity === 'sensible_skip') return {
    heading: 'Разумный пропуск',
    paragraphs: ['Ты не стал бросать в закрытый путь.',
      'Продолжай смотреть за движением вратаря и ворот: следующий проход может открыться.'],
  };
  if (evaluation.opportunity === 'missed_opportunity') return {
    heading: 'Окно прошло',
    paragraphs: ['На этом проходе путь к воротам открывался, но ты не бросил.',
      'Попробуй заметить просвет раньше и решиться на бросок, пока он открыт.'],
  };
  if (evaluation.opportunity === 'blocked_path') return {
    heading: response.server_result === 'goal' ? 'Гол, но выбор был рискованным' : 'Путь был закрыт',
    paragraphs: [response.server_result === 'goal'
      ? 'Шайба прошла, хотя путь не был явно открыт.'
      : 'В момент броска вратарь перекрывал путь к воротам.',
    'Посмотри, куда движутся вратарь и ворота. Дождись просвета, а не бросай в закрытый путь.'],
  };
  if (evaluation.timing === 'early' || evaluation.timing === 'late') return {
    heading: evaluation.timing === 'early' ? 'Чуть раньше окна' : 'Чуть позже окна',
    paragraphs: ['Ты выбрал подходящий проход, но бросил, когда путь ещё не открылся полностью или уже закрывался.',
      evaluation.timing === 'early' ? 'Дай вратарю ещё немного сместиться.'
        : 'В следующий раз решайся немного раньше.'],
  };
  return { heading: response.server_result === 'goal' ? 'Хороший момент' : 'Момент выбран верно',
    paragraphs: [response.server_result === 'goal'
      ? 'Ты бросил, когда путь к воротам был открыт.'
      : 'Ты заметил открытый путь. Шайба не дошла до гола, но решение о моменте было верным.',
    'Сохраняй этот взгляд на игрока, ворота и вратаря одновременно.'] };
}

function CoachCard({ heading, paragraphs, action, onAction }: Feedback & {
  action: string; onAction: () => void;
}): JSX.Element {
  return <div className="game-scoreboard advanced-training-v2-demo-stop" role="status">
    <div className="advanced-training-v2-demo-stop__heading">
      <img className="advanced-training-v2-demo-stop__avatar"
        src="/sprites/advanced-training-coach-avatar.webp" alt="Аватар Арсенича"
        width={42} height={42} />
      <span className="advanced-training-v2-demo-stop__title">{heading}</span>
    </div>
    <div className="advanced-training-v2-demo-stop__explanation">
      {paragraphs.map((paragraph) => <p key={paragraph}>– {paragraph}</p>)}
    </div>
    <button type="button" className="btn btn--cta" onClick={onAction}>{action}</button>
  </div>;
}

export function OpenWindowTrainingPlay({ stepKey, onBack, onCatalogRefresh }: {
  stepKey: OpenWindowStepKey;
  onBack: () => void;
  onCatalogRefresh: () => void;
}): JSX.Element {
  const [run, setRun] = useState<OpenWindowRunState | null>(null);
  const runRef = useRef<OpenWindowRunState | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [skipNotice, setSkipNotice] = useState<string | null>(null);
  const [canSkip, setCanSkip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replayKey, setReplayKey] = useState(0);
  const [demoShotKey, setDemoShotKey] = useState(0);
  const [paceElapsedSeconds, setPaceElapsedSeconds] = useState(0);
  const requestRef = useRef<Promise<Awaited<ReturnType<typeof startOpenWindowStep>>> | null>(null);
  const pendingDecisionRef = useRef<OpenWindowDecisionResponse | null>(null);
  const actionPendingRef = useRef(false);
  const step = OPEN_WINDOW_STEPS.find((item) => item.key === stepKey)!;
  const isPace = step.stage === 'pace';

  const applyState = useCallback((next: OpenWindowRunState) => {
    if (runRef.current && next.run_id === runRef.current.run_id &&
      next.decision_index < runRef.current.decision_index) return;
    runRef.current = next;
    setRun(next);
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!requestRef.current) requestRef.current = startOpenWindowStep(stepKey);
    void requestRef.current.then(({ state, restarted_due_to_version,
      restarted_due_to_timeout }) => {
      if (!mounted) return;
      applyState(state);
      if (restarted_due_to_version) setError('Правила обновились. Начни этот шаг заново.');
      else if (restarted_due_to_timeout) setSkipNotice('Прошлая попытка закончилась. Начнём с начала.');
    }).catch((cause: unknown) => {
      if (mounted) setError(cause instanceof Error ? cause.message : 'Не удалось открыть упражнение');
    });
    return () => { mounted = false; };
  }, [applyState, stepKey]);

  useEffect(() => {
    if (!skipNotice) return;
    const timer = window.setTimeout(() => setSkipNotice(null), 2500);
    return () => window.clearTimeout(timer);
  }, [skipNotice]);

  const beginAttempt = useCallback(async (current: OpenWindowRunState) => {
    setPhase('starting');
    try {
      const response = await startOpenWindowAttempt(stepKey, current.run_id);
      if (runRef.current?.run_id !== current.run_id) return;
      applyState(response.state);
      actionPendingRef.current = false;
      setReplayKey((value) => value + 1);
      setPaceElapsedSeconds(Math.floor(response.state.active_elapsed_ms / 1000));
      setPhase('play');
    } catch (cause) {
      actionPendingRef.current = false;
      setError(cause instanceof Error ? cause.message : 'Не удалось начать попытку');
      setPhase('feedback');
    }
  }, [applyState, stepKey]);

  const submitSkip = useCallback(async (current: OpenWindowRunState) => {
    if (actionPendingRef.current) return;
    actionPendingRef.current = true;
    setPhase('starting');
    try {
      const response = await submitOpenWindowDecision(stepKey, {
        run_id: current.run_id, attempt_token: current.attempt_token,
        decision_index: current.decision_index + 1, scene_id: current.scene.id,
        input: { type: 'skip' },
      });
      applyState(response.state);
      setFeedback(feedbackFor(response));
      setPhase(response.completed ? 'complete' : 'feedback');
      if (response.completed) onCatalogRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось записать пропуск');
      setPhase('feedback');
    } finally { actionPendingRef.current = false; }
  }, [applyState, onCatalogRefresh, stepKey]);

  const skipTraversal = useCallback(async () => {
    const current = runRef.current;
    if (!current || actionPendingRef.current || current.skip_recorded || !canSkip) return;
    actionPendingRef.current = true;
    try {
      const response = await submitOpenWindowDecision(stepKey, {
        run_id: current.run_id, attempt_token: current.attempt_token,
        decision_index: current.decision_index + 1, scene_id: current.scene.id,
        input: { type: 'skip' },
      });
      applyState(response.state);
      setSkipNotice(response.sound ? 'Верно, этот проход лучше пропустить.'
        : 'Здесь уже был открытый путь. Не жди только идеального момента.');
    } catch (cause) {
      setSkipNotice(cause instanceof Error ? cause.message : 'Не удалось пропустить проход');
    } finally { actionPendingRef.current = false; }
  }, [applyState, canSkip, stepKey]);

  const finishSeries = useCallback(async (current: OpenWindowRunState) => {
    if (actionPendingRef.current) return;
    actionPendingRef.current = true;
    setPhase('starting');
    try {
      const response = await finishOpenWindowSeries(stepKey, {
        run_id: current.run_id, attempt_token: current.attempt_token,
      });
      applyState(response.state);
      setFeedback({ heading: response.completed ? 'Шаг пройден' : 'Серия завершена',
        paragraphs: [`Ты принял ${response.summary.decisions} решений и ${response.summary.sound} раз выбрал открытый путь.`,
          response.completed ? 'Ты прошёл этот шаг. Продолжай применять навык в игре.'
            : response.state.phase === 'check' ? 'Теперь попробуй без подсказок.'
              : 'Повтори серию и смотри за открывающимся путём, а не только за шайбой.'] });
      setPhase(response.completed ? 'complete' : 'feedback');
      if (response.completed) onCatalogRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось завершить серию');
      setPhase('feedback');
    } finally { actionPendingRef.current = false; }
  }, [applyState, onCatalogRefresh, stepKey]);

  const onSceneClock = useCallback((sceneMs: number) => {
    const current = runRef.current;
    if (!current) return;
    if (isPace && phase === 'play') {
      setPaceElapsedSeconds(Math.floor(Math.max(0, sceneMs - current.scene.startMs) / 1000));
    }
    if (stepKey === 'decide_skip' && phase === 'play' && !current.skip_recorded) {
      const traversalMs = 500 / speeds.shooterFrequency;
      const available = sceneMs >= current.scene.startMs + traversalMs &&
        sceneMs < current.scene.targetWindow.startMs;
      setCanSkip((previous) => previous === available ? previous : available);
    }
    if (phase === 'demo' && sceneMs >= current.demonstration.targetMs - 8) {
      setPhase('demo-stop');
    } else if (phase === 'play' && sceneMs >= current.scene.endMs - 8) {
      if (isPace) void finishSeries(current);
      else void submitSkip(current);
    }
  }, [finishSeries, isPace, phase, stepKey, submitSkip]);

  const onResultComplete = useCallback(() => {
    if (phase === 'demo-shot') { setPhase('demo-review'); return; }
    const response = pendingDecisionRef.current;
    pendingDecisionRef.current = null;
    if (!response) return;
    if (isPace && !response.completed) {
      void beginAttempt(response.state);
      return;
    }
    setFeedback(feedbackFor(response));
    setPhase(response.completed ? 'complete' : 'feedback');
    if (response.completed) onCatalogRefresh();
  }, [beginAttempt, isPace, onCatalogRefresh, phase]);

  const isDemo = phase === 'demo' || phase === 'demo-stop' ||
    phase === 'demo-shot' || phase === 'demo-review';
  const scene = isDemo ? run?.demonstration : run?.scene;
  const shotResolver: PlayShotResolver | undefined = useMemo(() => scene
    ? ({ input }) => resolveOpenWindowShot(scene, input.tapTime) : undefined, [scene]);

  if (!run || !scene) return <main className="screen initial-training-play-state"
    role={error ? 'alert' : undefined}>{error ?? 'Готовим упражнение…'}
    {error ? <button type="button" className="btn btn--ghost" onClick={onBack}>К упражнениям</button> : null}
  </main>;

  const modalOpen = phase === 'intro' || phase === 'practice-intro' ||
    phase === 'demo-review' || phase === 'complete';
  const active = phase !== 'intro' && phase !== 'practice-intro' && phase !== 'complete';
  const feedbackCard = phase === 'demo-stop'
    ? <CoachCard heading="Открытый путь к воротам"
      paragraphs={[demonstrationCopy(run.demonstration),
        'Бросок можно совершить примерно в этот момент.']}
      action="Понятно" onAction={() => { setDemoShotKey((value) => value + 1);
        setPhase('demo-shot'); }} />
    : phase === 'feedback' && feedback
      ? <CoachCard {...feedback} action="Понятно" onAction={() => {
        setFeedback(null); void beginAttempt(runRef.current ?? run);
      }} /> : undefined;
  const skipAction = phase === 'play' && stepKey === 'decide_skip' && !run.skip_recorded
    ? <button type="button" className="btn btn--ghost" disabled={!canSkip}
      onClick={() => void skipTraversal()}>Пропустить проход</button> : undefined;

  return <>
    <PlayView<OpenWindowRunState>
      suppressedByModal={modalOpen} showIceCar={false} onBack={onBack} active={active}
      seed={scene.sessionSeed} goalieId={scene.goalieId}
      goalieConfig={getGoalie(scene.goalieId)} periodNumber={1}
      periodLabel="УПРАЖНЕНИЯ" scoreboardPeriodNumber={1} scoreboardPeriodsTotal={12}
      speedOverrides={speedOverrides} goals={0} shots={isDemo ? 0 : run.shots_taken}
      shotIndexBase={isDemo ? 0 : run.shots_taken} sceneShotIndex={scene.shotIndex}
      timer={isPace ? `${Math.max(0, Math.ceil((scene.endMs - scene.startMs) / 1000) - paceElapsedSeconds)} с`
        : `${run.phase === 'practice' ? 'Практика' : 'Зачёт'} · ${run.attempt_index}`}
      timerLabel={run.phase === 'practice' ? 'ПРАКТИКА' : 'ЗАЧЁТ'}
      shotButtonLabel="БРОСОК" primaryActionBlocked={phase !== 'play'}
      maxSceneTimeMs={phase === 'demo' || phase === 'demo-stop'
        ? scene.targetMs : phase === 'play' ? scene.endMs : undefined}
      sceneTimeScale={phase === 'demo-stop' || phase === 'demo-review' || phase === 'feedback' ||
        phase === 'starting' ? () => 0 : undefined}
      shotTriggerKey={demoShotKey} hitboxesVisible={false}
      backLabel="К упражнениям" optimisticAddShot={() => undefined}
      submitShot={async ({ input, claimedResult }) => {
        if (isDemo) return { serverResult: claimedResult, state: run,
          isCurrent: () => true };
        if (actionPendingRef.current) return null;
        actionPendingRef.current = true;
        try {
          const response = await submitOpenWindowDecision(stepKey, {
            run_id: run.run_id, attempt_token: run.attempt_token,
            decision_index: run.decision_index + 1, scene_id: run.scene.id,
            input: { type: 'shot', tap_time_ms: input.tapTime },
          });
          pendingDecisionRef.current = response;
          return { serverResult: response.server_result ?? claimedResult,
            state: response.state,
            isCurrent: () => runRef.current?.run_id === response.state.run_id,
            resultPresentation: { title: response.server_result === 'goal' ? 'Гол'
              : response.server_result === 'save' ? 'Сэйв' : 'Мимо' } };
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Не удалось записать бросок');
          return null;
        } finally { actionPendingRef.current = false; }
      }}
      applyState={applyState} shotResolver={shotResolver}
      onSceneClock={onSceneClock} onResultComplete={onResultComplete}
      longCourtBackground={TRAINING_LONG_COURT_BACKGROUND}
      playerOptions={TRAINING_STREET_PLAYER_OPTIONS}
      goalOptions={TRAINING_COURSE_GOAL_OPTIONS}
      goalieOptions={TRAINING_AMATEUR_GOALIE_OPTIONS}
      resultCopy={{ goal: 'ГОЛ', save: 'СЭЙВ', miss: 'МИМО' }}
      statusNotice={error ?? skipNotice ?? `${step.title}\n${run.phase === 'practice' ? 'Практика' : 'Зачёт'}`}
      statusNoticeTone={error ? 'error' : undefined} statusNoticeUnderScoreboard
      overlayControls={feedbackCard ?? skipAction}
      overlayControlsCentered={Boolean(feedbackCard)}
      overlayControlsTop={feedbackCard ? '49%' : skipAction ? '42%' : undefined}
      clockRebaseKey={isDemo ? `${scene.id}:demo:${replayKey}` : `${run.run_id}:${replayKey}`}
      initialSceneElapsedMs={scene.startMs + (isDemo ? 0 : run.active_elapsed_ms)}
      initialShooterElapsedMs={scene.startMs + (isDemo ? 0 : run.active_elapsed_ms)}
      waitForShotResponseBeforeResultClose holdSceneAfterResult
      resumeHeldResultKey={replayKey} preserveSceneOnModalReturn
    />
    <AccessibleModal open={phase === 'intro'} title="Сначала – показ"
      onRequestClose={onBack} cardClassName="advanced-training-v2-modal"
      beforeHeader={<img className="advanced-training-v2-modal__avatar"
        src="/sprites/advanced-training-coach-modal.webp" alt="Аватар Арсенича"
        width={44} height={44} />}>
      <p className="modal-copy">– {step.objective} Сначала посмотри на движение игрока, ворот и вратаря. Потом попробуй сам.</p>
      <div className="modal-actions"><button type="button" className="modal-primary btn btn--cta"
        onClick={() => { setReplayKey((value) => value + 1); setPhase('demo'); }}>
        Смотреть показ</button></div>
    </AccessibleModal>
    <AccessibleModal open={phase === 'demo-review'} title="Разбор момента"
      onRequestClose={onBack} cardClassName="advanced-training-v2-modal">
      <p className="modal-copy">– {demonstrationCopy(run.demonstration)}</p>
      <div className="modal-actions">
        <button type="button" className="btn btn--ghost" onClick={() => {
          setReplayKey((value) => value + 1); setDemoShotKey(0); setPhase('demo');
        }}>Повторить показ</button>
        <button type="button" className="modal-primary btn btn--cta"
          onClick={() => setPhase('practice-intro')}>Попробовать самому</button>
      </div>
    </AccessibleModal>
    <AccessibleModal open={phase === 'practice-intro'} title="Твоя очередь"
      onRequestClose={onBack} cardClassName="advanced-training-v2-modal">
      <p className="modal-copy">– Кнопка броска доступна всё время. Смотри, когда путь к воротам открывается, и решай сам.</p>
      <div className="modal-actions"><button type="button" className="modal-primary btn btn--cta"
        onClick={() => void beginAttempt(run)}>Начать практику</button></div>
    </AccessibleModal>
    <AccessibleModal open={phase === 'complete'} title="Шаг пройден"
      onRequestClose={onBack} cardClassName="advanced-training-v2-modal">
      <p className="modal-copy">– Ты научился лучше замечать открытый путь к воротам. Продолжай к следующему шагу.</p>
      <div className="modal-actions"><button type="button" className="modal-primary btn btn--cta"
        onClick={onBack}>К упражнениям</button></div>
    </AccessibleModal>
  </>;
}
