import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE,
  PERSPECTIVE_COURT_GOALIE_VISUAL_Y_OFFSET,
  PERSPECTIVE_COURT_VISUAL_Y_SCALE,
  STICK_NEUTRAL,
  type GoalieConfig,
} from '@hockey/game-core';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { BonusGameAttempt, BonusPeriodRule } from '../api/bonusGames.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { PlayView } from '../game/PlayView.js';
import { deriveBonusGameClockBasis } from '../game/bonusGameTiming.js';
import type { SpeedOverrides } from '../game/loop.js';
import type { GoalieOptions } from '../game/renderer/Goalie.js';
import { useBonusGameStore } from '../stores/bonusGameStore.js';
import { formatRussianCount } from '../lib/russianPlural.js';

const BONUS_GAME_GOALIE_OPTIONS: Omit<GoalieOptions, 'idleSpriteUrl' | 'saveSpriteUrl'> = {
  visualYScale: PERSPECTIVE_COURT_VISUAL_Y_SCALE,
  visualYOffset: PERSPECTIVE_COURT_GOALIE_VISUAL_Y_OFFSET,
  visualXScale: PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE,
  sizeScale: 1.134,
  idleSizeScale: 1.22,
  saveSizeScale: 0.96,
  saveVisualYOffset: 10,
  shadow: true,
};

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1_000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function authoritativeRemainingMs(
  endsAt: string | null,
  serverNow: string,
  receivedAtPerformanceMs: number | null,
): number {
  if (endsAt === null) return 0;
  const end = Date.parse(endsAt);
  const server = Date.parse(serverNow);
  if (!Number.isFinite(end) || !Number.isFinite(server)) return 0;
  const receivedAt = receivedAtPerformanceMs ?? performance.now();
  return Math.max(0, end - server - Math.max(0, performance.now() - receivedAt));
}

function ModeState({
  title = 'Бонусная игра',
  text,
  role,
  actionLabel,
  onAction,
  busy = false,
}: {
  title?: string;
  text: string;
  role?: 'status' | 'alert';
  actionLabel?: string;
  onAction?: () => void;
  busy?: boolean;
}): JSX.Element {
  return (
    <main className="screen bonus-game-mode-state">
      <section className="bonus-game-mode-card" {...(role ? { role } : {})}>
        <h1>{title}</h1>
        <p>{text}</p>
        {actionLabel && onAction ? (
          <button type="button" className="btn btn--cta" disabled={busy} onClick={onAction}>
            {actionLabel}
          </button>
        ) : null}
      </section>
    </main>
  );
}

function BonusBreak({
  attempt,
  receivedAtPerformanceMs,
  onElapsed,
}: {
  attempt: BonusGameAttempt;
  receivedAtPerformanceMs: number | null;
  onElapsed: () => void | Promise<void>;
}): JSX.Element {
  const [remainingMs, setRemainingMs] = useState(() =>
    authoritativeRemainingMs(attempt.break_ends_at, attempt.server_now, receivedAtPerformanceMs),
  );
  const elapsedRef = useRef(false);

  useEffect(() => {
    const update = (): void => {
      const remaining = authoritativeRemainingMs(
        attempt.break_ends_at,
        attempt.server_now,
        receivedAtPerformanceMs,
      );
      setRemainingMs(remaining);
      if (remaining === 0 && !elapsedRef.current) {
        elapsedRef.current = true;
        void onElapsed();
      }
    };
    update();
    const id = window.setInterval(update, 250);
    return () => window.clearInterval(id);
  }, [attempt.break_ends_at, attempt.server_now, onElapsed, receivedAtPerformanceMs]);

  return (
    <main className="screen bonus-game-mode-state">
      <section className="bonus-game-mode-card">
        <h1>Перерыв</h1>
        <p>Следующий период начнётся после серверной проверки таймера.</p>
        <strong role="timer" aria-label="До конца перерыва">
          {formatCountdown(remainingMs)}
        </strong>
      </section>
    </main>
  );
}

function BonusResult({
  kind,
  attempt,
  onCatalog,
}: {
  kind: 'failed' | 'completed' | 'abandoned';
  attempt: BonusGameAttempt;
  onCatalog: () => void;
}): JSX.Element {
  const title = kind === 'completed' ? 'Игра пройдена' : 'Попытка завершена';
  let copy: string;
  if (kind === 'failed') copy = 'Цель не достигнута';
  else if (kind === 'abandoned') copy = 'Прогресс попытки потерян';
  else if (attempt.reward_granted) copy = 'Награда за первое прохождение';
  else copy = 'Повтор завершён без награды';
  const accuracy =
    attempt.shots_taken > 0 ? Math.round((attempt.goals / attempt.shots_taken) * 100) : 0;

  return (
    <AccessibleModal
      title={title}
      copy={copy}
      closeBlocked={true}
      onClose={() => undefined}
      cardClassName="bonus-game-result-modal"
      backdropStyle={{
        background: 'rgba(15, 23, 42, 0.35)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <div
        className="bonus-game-result-metrics"
        aria-label={`Итого: ${attempt.goals} голов из ${attempt.shots_taken} бросков, точность ${accuracy}%`}
      >
        <BonusResultMetric label="Голы" value={String(attempt.goals)} />
        <BonusResultMetric label="Броски" value={String(attempt.shots_taken)} />
        <BonusResultMetric label="Точность" value={`${accuracy}%`} />
      </div>
      {kind === 'completed' && attempt.reward_granted ? (
        <div className="bonus-game-result-reward">
          <span className="bonus-game-result-reward-label">Награда</span>
          <p>
            {formatRussianCount(attempt.reward.coins, 'монета', 'монеты', 'монет')} ·{' '}
            {formatRussianCount(
              attempt.reward.experience,
              'очко опыта',
              'очка опыта',
              'очков опыта',
            )}{' '}
            · {formatRussianCount(attempt.reward.stars, 'звезда', 'звезды', 'звёзд')}
          </p>
          <p>Площадка «{attempt.arena.title}» открыта</p>
        </div>
      ) : null}
      <div className="modal-actions bonus-game-result-actions">
        <button type="button" className="modal-primary btn btn--cta" onClick={onCatalog}>
          К бонусным играм
        </button>
      </div>
    </AccessibleModal>
  );
}

function BonusResultMetric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="bonus-game-result-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ruleForPeriod(attempt: BonusGameAttempt, periodNumber: number): BonusPeriodRule | null {
  return (
    attempt.rules.periods.find((candidate) => candidate.period_number === periodNumber) ?? null
  );
}

function goalieConfigFor(attempt: BonusGameAttempt, rule: BonusPeriodRule): GoalieConfig {
  return {
    id: `bonus:${attempt.game_slug}:p${rule.period_number}`,
    name: attempt.game_title,
    pattern: rule.goalie_pattern,
    hp: 0,
    baseReward: 0,
    firstClearBonus: 0,
    speed: 0,
    amplitude: rule.goalie_amplitude,
    frequency: rule.goalie_frequency,
    goalAmplitude: rule.goal_amplitude,
    goalFrequency: rule.goal_frequency,
  };
}

function speedOverridesFor(rule: BonusPeriodRule): SpeedOverrides {
  return {
    goalFreq: rule.goal_frequency,
    goalieFreq: rule.goalie_frequency,
    shooterFreq: rule.shooter_frequency,
    puckSpeed: rule.puck_speed_per_ms,
  };
}

export function BonusGamePlayScreen(): JSX.Element {
  const navigate = useNavigate();
  const { gameId } = useParams<{ gameId: string }>();
  const [searchParams] = useSearchParams();
  const routeAttemptId = searchParams.get('attempt');
  const attempt = useBonusGameStore((state) => state.attempt);
  const loading = useBonusGameStore((state) => state.loading);
  const error = useBonusGameStore((state) => state.error);
  const inFlight = useBonusGameStore((state) => state.inFlight);
  const needsReconcile = useBonusGameStore((state) => state.needsReconcile);
  const receivedAtPerformanceMs = useBonusGameStore((state) => state.receivedAtPerformanceMs);
  const loadCurrent = useBonusGameStore((state) => state.loadCurrent);
  const loadAttempt = useBonusGameStore((state) => state.loadAttempt);
  const applyPendingShot = useBonusGameStore((state) => state.applyPendingShot);
  const startPeriod = useBonusGameStore((state) => state.startPeriod);
  const optimisticAddShot = useBonusGameStore((state) => state.optimisticAddShot);
  const submitShot = useBonusGameStore((state) => state.submitShot);
  const abandon = useBonusGameStore((state) => state.abandon);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [isConfirmingAbandon, setIsConfirmingAbandon] = useState(false);
  const abandonRequestRef = useRef(false);
  const loadedRouteRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      useBonusGameStore.getState().applyPendingShot();
    };
  }, []);

  const reconcileAttempt = useCallback(async (): Promise<void> => {
    const id = attempt?.id ?? routeAttemptId;
    if (id) await loadAttempt(id);
    else await loadCurrent();
  }, [attempt?.id, loadAttempt, loadCurrent, routeAttemptId]);

  useEffect(() => {
    if (needsReconcile) return;
    const routeKey = `${gameId ?? ''}:${routeAttemptId ?? ''}`;
    if (loadedRouteRef.current === routeKey) return;
    loadedRouteRef.current = routeKey;
    if (routeAttemptId) {
      void loadAttempt(routeAttemptId);
      return;
    }
    const current = useBonusGameStore.getState().attempt;
    if (current && current.game_id === gameId) {
      void loadAttempt(current.id);
      return;
    }
    void loadCurrent();
  }, [gameId, loadAttempt, loadCurrent, needsReconcile, routeAttemptId]);

  useEffect(() => {
    if (!needsReconcile) return;
    void reconcileAttempt();
  }, [needsReconcile, reconcileAttempt]);

  const goToCatalog = useCallback(() => navigate('/bonus-games'), [navigate]);
  const refreshAttempt = useCallback(async (): Promise<void> => {
    if (attempt) await loadAttempt(attempt.id);
  }, [attempt, loadAttempt]);
  const handleStartPeriod = useCallback(async (): Promise<BonusGameAttempt | null> => {
    if (inFlight) return null;
    return startPeriod();
  }, [inFlight, startPeriod]);

  const confirmAndAbandon = useCallback(async (): Promise<void> => {
    if (abandonRequestRef.current) return;
    abandonRequestRef.current = true;
    setIsConfirmingAbandon(true);
    const result = await abandon();
    if (result?.status === 'abandoned') {
      navigate('/bonus-games');
      return;
    }
    abandonRequestRef.current = false;
    setIsConfirmingAbandon(false);
  }, [abandon, navigate]);

  if (needsReconcile) {
    return (
      <ModeState
        role="status"
        text="Проверяем результат броска…"
        {...(!loading
          ? {
              actionLabel: 'Повторить проверку',
              onAction: () => void reconcileAttempt(),
            }
          : {})}
      />
    );
  }
  if (loading && attempt === null) {
    return <ModeState role="status" text="Загружаем бонусную игру…" />;
  }
  if (attempt === null) {
    return (
      <ModeState
        {...(error ? { role: 'alert' as const } : {})}
        text={error ?? 'Активная попытка не найдена.'}
        actionLabel="К бонусным играм"
        onAction={goToCatalog}
      />
    );
  }
  if (attempt.game_id !== gameId) {
    return (
      <ModeState
        role="alert"
        text="Открыта другая бонусная попытка. Вернитесь в каталог."
        actionLabel="К бонусным играм"
        onAction={goToCatalog}
      />
    );
  }
  const terminalKind =
    attempt.status === 'failed' || attempt.status === 'completed' || attempt.status === 'abandoned'
      ? attempt.status
      : null;
  const isTerminal = terminalKind !== null;
  if (!isTerminal && attempt.state === 'break_active') {
    return (
      <BonusBreak
        attempt={attempt}
        receivedAtPerformanceMs={receivedAtPerformanceMs}
        onElapsed={refreshAttempt}
      />
    );
  }
  const isIdle = attempt.state === 'idle';
  const isPeriodActive = attempt.state === 'period_active';
  const periodNumber = isIdle ? attempt.current_period + 1 : attempt.current_period;
  const rule = ruleForPeriod(attempt, periodNumber);
  if (rule === null || (isPeriodActive && attempt.period_started_at === null)) {
    return <ModeState role="alert" text="Не удалось прочитать правила активного периода." />;
  }
  const clockBasis = isPeriodActive
    ? deriveBonusGameClockBasis(attempt)
    : { sceneElapsedMs: 0, shooterElapsedMs: 0 };
  const localPeriodEndsAt = isPeriodActive
    ? Date.now() +
      authoritativeRemainingMs(attempt.period_ends_at, attempt.server_now, receivedAtPerformanceMs)
    : undefined;
  const goalieConfig = goalieConfigFor(attempt, rule);
  const speedOverrides = speedOverridesFor(rule);
  const preloadAssets = [
    attempt.arena.artwork_url,
    attempt.goalkeeper_ready_url,
    attempt.goalkeeper_save_url,
  ];
  const clockRebaseKey = isPeriodActive
    ? `${attempt.period_started_at}:${attempt.server_now}:${receivedAtPerformanceMs ?? ''}`
    : isTerminal
      ? `terminal:${attempt.id}:${attempt.closed_at ?? attempt.status}`
      : `idle:${periodNumber}`;
  const terminalShotsTotal = attempt.rules.periods.reduce(
    (total, period) => total + period.shots_limit,
    0,
  );

  return (
    <>
      <PlayView
        suppressedByModal={isIdle || isTerminal}
        showIceCar={isTerminal}
        onBack={() => setConfirmAbandon(true)}
        backLabel="К бонусным играм"
        active={isPeriodActive && !needsReconcile}
        seed={attempt.attempt_seed}
        goalieId={null}
        goalieConfig={goalieConfig}
        goalieOptions={{
          ...BONUS_GAME_GOALIE_OPTIONS,
          idleSpriteUrl: attempt.goalkeeper_ready_url,
          saveSpriteUrl: attempt.goalkeeper_save_url,
        }}
        preloadAssets={preloadAssets}
        periodNumber={periodNumber}
        periodsTotal={attempt.rules.total_periods}
        speedOverrides={speedOverrides}
        stickEffects={STICK_NEUTRAL}
        goals={attempt.goals}
        shots={isTerminal ? attempt.shots_taken : attempt.current_period_shots_taken}
        shotsTotal={isTerminal ? terminalShotsTotal : rule.shots_limit}
        timer={isTerminal ? '00:00' : isIdle ? formatCountdown(rule.duration_ms) : undefined}
        shotButtonLabel={
          isTerminal ? 'ИГРА ЗАВЕРШЕНА' : isIdle ? (inFlight ? 'НАЧИНАЕМ...' : 'НАЧАТЬ') : undefined
        }
        inactiveAction={isIdle ? handleStartPeriod : undefined}
        entranceBeforeInactiveAction={true}
        sessionStartedAt={attempt.period_started_at}
        serverNow={attempt.server_now}
        receivedAtPerformanceMs={receivedAtPerformanceMs ?? undefined}
        initialSceneElapsedMs={clockBasis.sceneElapsedMs}
        initialShooterElapsedMs={clockBasis.shooterElapsedMs}
        clockRebaseKey={clockRebaseKey}
        periodEndsAt={localPeriodEndsAt}
        onTimerExpired={isPeriodActive ? refreshAttempt : undefined}
        optimisticAddShot={optimisticAddShot}
        submitShot={async ({ shotIndex, input, claimedResult }) => {
          if (input.shooterTapTime === undefined) return null;
          const result = await submitShot(
            {
              claimed_shot_index: shotIndex,
              input: {
                tapTime: input.tapTime,
                shooterTapTime: input.shooterTapTime,
                ...(input.puckSpeedPerMs !== undefined
                  ? { puckSpeedPerMs: input.puckSpeedPerMs }
                  : {}),
                ...(input.shooterFrequency !== undefined
                  ? { shooterFrequency: input.shooterFrequency }
                  : {}),
                ...(input.goalieFrequency !== undefined
                  ? { goalieFrequency: input.goalieFrequency }
                  : {}),
                ...(input.goalFrequency !== undefined
                  ? { goalFrequency: input.goalFrequency }
                  : {}),
              },
              claimed_result: claimedResult,
            },
            { deferApply: true },
          );
          if (!mountedRef.current) applyPendingShot();
          return result ? { serverResult: result.serverResult, state: result.attempt } : null;
        }}
        applyState={() => undefined}
        applyResolvedState={() => applyPendingShot()}
        longCourtBackground={attempt.arena.artwork_url}
        rinkBorderRadius={28}
      />

      {terminalKind ? (
        <BonusResult kind={terminalKind} attempt={attempt} onCatalog={goToCatalog} />
      ) : null}

      {confirmAbandon && !isTerminal ? (
        <AccessibleModal
          title="Выйти из бонусной игры?"
          copy="Попытка сохранится, если продолжить позже. Завершение удалит текущий прогресс."
          closeBlocked={isConfirmingAbandon}
          onClose={() => setConfirmAbandon(false)}
        >
          {error ? (
            <p role="alert" className="bonus-game-abandon-error">
              {error}
            </p>
          ) : null}
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn--ghost"
              disabled={isConfirmingAbandon}
              onClick={goToCatalog}
            >
              Продолжить позже
            </button>
            <button
              type="button"
              className="modal-primary btn btn--cta"
              disabled={isConfirmingAbandon}
              onClick={() => void confirmAndAbandon()}
            >
              {isConfirmingAbandon ? 'Завершаем…' : 'Завершить попытку'}
            </button>
          </div>
        </AccessibleModal>
      ) : null}
    </>
  );
}
