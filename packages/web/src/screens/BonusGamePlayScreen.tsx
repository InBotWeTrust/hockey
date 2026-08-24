import { useCallback, useEffect, useRef, useState } from 'react';
import { RINK, STICK_NEUTRAL, type GoalieConfig } from '@hockey/game-core';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { BonusGameAttempt, BonusPeriodRule } from '../api/bonusGames.js';
import { PlayView } from '../game/PlayView.js';
import { deriveBonusGameClockBasis } from '../game/bonusGameTiming.js';
import type { SpeedOverrides } from '../game/loop.js';
import { useBonusGameStore } from '../stores/bonusGameStore.js';

const BONUS_GAME_LAYER_STYLE = { inset: 0 } as const;

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

  return (
    <main className="screen bonus-game-mode-state">
      <section className="bonus-game-mode-card">
        <h1>{title}</h1>
        <p>{copy}</p>
        {kind === 'completed' && attempt.reward_granted ? (
          <p>
            {attempt.reward.coins} монет · {attempt.reward.experience} опыта ·{' '}
            {attempt.reward.stars} звезда · площадка «{attempt.arena.title}» открыта
          </p>
        ) : null}
        <p>
          Голы: {attempt.goals} · броски: {attempt.shots_taken}
        </p>
        <button type="button" className="btn btn--cta" onClick={onCatalog}>
          К бонусным играм
        </button>
      </section>
    </main>
  );
}

function ruleForAttempt(attempt: BonusGameAttempt): BonusPeriodRule | null {
  return (
    attempt.rules.periods.find((candidate) => candidate.period_number === attempt.current_period) ??
    null
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
  const startPeriod = useBonusGameStore((state) => state.startPeriod);
  const optimisticAddShot = useBonusGameStore((state) => state.optimisticAddShot);
  const submitShot = useBonusGameStore((state) => state.submitShot);
  const abandon = useBonusGameStore((state) => state.abandon);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [isConfirmingAbandon, setIsConfirmingAbandon] = useState(false);
  const abandonRequestRef = useRef(false);
  const loadedRouteRef = useRef<string | null>(null);

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
  if (attempt.status === 'failed') {
    return <BonusResult kind="failed" attempt={attempt} onCatalog={goToCatalog} />;
  }
  if (attempt.status === 'completed') {
    return <BonusResult kind="completed" attempt={attempt} onCatalog={goToCatalog} />;
  }
  if (attempt.status === 'abandoned') {
    return <BonusResult kind="abandoned" attempt={attempt} onCatalog={goToCatalog} />;
  }
  if (attempt.state === 'break_active') {
    return (
      <BonusBreak
        attempt={attempt}
        receivedAtPerformanceMs={receivedAtPerformanceMs}
        onElapsed={refreshAttempt}
      />
    );
  }
  if (attempt.state === 'idle') {
    const nextPeriod = attempt.current_period + 1;
    return (
      <ModeState
        title={attempt.game_title}
        text={`Цель: ${attempt.rules.target_goals} голов. Текущий результат: ${attempt.goals}.`}
        actionLabel={`Начать период ${nextPeriod}`}
        busy={inFlight}
        onAction={() => void startPeriod()}
      />
    );
  }

  const rule = ruleForAttempt(attempt);
  if (rule === null || attempt.period_started_at === null) {
    return <ModeState role="alert" text="Не удалось прочитать правила активного периода." />;
  }
  const clockBasis = deriveBonusGameClockBasis(attempt);
  const remainingMs = authoritativeRemainingMs(
    attempt.period_ends_at,
    attempt.server_now,
    receivedAtPerformanceMs,
  );
  const localPeriodEndsAt = Date.now() + remainingMs;
  const goalieConfig = goalieConfigFor(attempt, rule);
  const speedOverrides = speedOverridesFor(rule);
  const preloadAssets = [
    attempt.arena.artwork_url,
    attempt.goalkeeper_ready_url,
    attempt.goalkeeper_save_url,
  ];
  const clockRebaseKey = `${attempt.period_started_at}:${attempt.server_now}:${receivedAtPerformanceMs ?? ''}`;

  return (
    <>
      <PlayView
        suppressedByModal={confirmAbandon}
        showIceCar={false}
        onBack={goToCatalog}
        backLabel="К бонусным играм"
        active={!needsReconcile}
        seed={attempt.attempt_seed}
        goalieId={null}
        goalieConfig={goalieConfig}
        goalieOptions={{
          idleSpriteUrl: attempt.goalkeeper_ready_url,
          saveSpriteUrl: attempt.goalkeeper_save_url,
        }}
        preloadAssets={preloadAssets}
        periodNumber={attempt.current_period}
        periodsTotal={attempt.rules.total_periods}
        speedOverrides={speedOverrides}
        stickEffects={STICK_NEUTRAL}
        goals={attempt.goals}
        shots={attempt.current_period_shots_taken}
        shotsTotal={rule.shots_limit}
        sessionStartedAt={attempt.period_started_at}
        serverNow={attempt.server_now}
        receivedAtPerformanceMs={receivedAtPerformanceMs ?? undefined}
        initialSceneElapsedMs={clockBasis.sceneElapsedMs}
        initialShooterElapsedMs={clockBasis.shooterElapsedMs}
        clockRebaseKey={clockRebaseKey}
        periodEndsAt={localPeriodEndsAt}
        onTimerExpired={refreshAttempt}
        optimisticAddShot={optimisticAddShot}
        submitShot={async ({ shotIndex, input, claimedResult }) => {
          if (input.shooterTapTime === undefined) return null;
          const result = await submitShot({
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
              ...(input.goalFrequency !== undefined ? { goalFrequency: input.goalFrequency } : {}),
            },
            claimed_result: claimedResult,
          });
          return result ? { serverResult: result.serverResult, state: result.attempt } : null;
        }}
        applyState={() => undefined}
        longCourtBackground={attempt.arena.artwork_url}
        rinkAspectRatio={`${RINK.width} / ${RINK.height}`}
        rinkBorderRadius={28}
        gameLayerStyle={BONUS_GAME_LAYER_STYLE}
        overlayControls={
          <button
            type="button"
            className="btn btn--ghost bonus-game-abandon-button"
            onClick={() => setConfirmAbandon(true)}
          >
            Завершить попытку
          </button>
        }
      />

      {confirmAbandon ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-label="Завершить попытку?"
          >
            <h2 className="modal-title">Завершить попытку?</h2>
            <p className="modal-copy">Прогресс попытки пропадёт. Оплаченное открытие останется.</p>
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
                onClick={() => setConfirmAbandon(false)}
              >
                Продолжить игру
              </button>
              <button
                type="button"
                className="modal-primary btn btn--cta"
                disabled={isConfirmingAbandon}
                onClick={() => void confirmAndAbandon()}
              >
                {isConfirmingAbandon ? 'Завершаем…' : 'Да, завершить'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
