import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE,
  PERSPECTIVE_COURT_GOALIE_VISUAL_Y_OFFSET,
  PERSPECTIVE_COURT_VISUAL_Y_SCALE,
  STICK_NEUTRAL,
  type GoalieConfig,
} from '@hockey/game-core';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type {
  BonusGameAttempt,
  BonusPeriodLoadoutSelection,
  BonusPeriodRule,
} from '../api/bonusGames.js';
import { fetchMyInventory, type InventoryEquipmentKind } from '../api/inventory.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { PlayView } from '../game/PlayView.js';
import {
  deriveBonusGameClockBasis,
  deriveBonusGameClockEpoch,
  futureBonusPeriodDurationMs,
} from '../game/bonusGameTiming.js';
import type { SpeedOverrides } from '../game/loop.js';
import type { GoalieOptions } from '../game/renderer/Goalie.js';
import { useBonusGameStore } from '../stores/bonusGameStore.js';
import { formatRussianCount } from '../lib/russianPlural.js';
import {
  qualificationDescription,
  qualificationProgress,
} from '../game/bonusGameQualification.js';

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

function BonusReconcileOverlay({
  loading,
  onRetry,
}: {
  loading: boolean;
  onRetry: () => void;
}): JSX.Element {
  return (
    <div className="bonus-game-reconcile" role="status" aria-live="polite">
      <span className="bonus-game-reconcile__spinner" aria-hidden="true" />
      <span>Проверяем результат броска…</span>
      {!loading ? (
        <button
          type="button"
          className="bonus-game-reconcile__retry"
          aria-label="Повторить проверку"
          onClick={onRetry}
        >
          Повторить
        </button>
      ) : null}
    </div>
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
    <AccessibleModal
      title="Перерыв"
      copy="Следующий период начнётся после серверной проверки таймера."
      closeBlocked={true}
      onClose={() => undefined}
      cardClassName="bonus-game-break-modal"
    >
      <strong className="bonus-game-break-timer" role="timer" aria-label="До конца перерыва">
        {formatCountdown(remainingMs)}
      </strong>
    </AccessibleModal>
  );
}

function BonusPreview({
  attempt,
  busy,
  onAcknowledge,
}: {
  attempt: BonusGameAttempt;
  busy: boolean;
  onAcknowledge: (dismissFuture: boolean) => void | Promise<unknown>;
}): JSX.Element {
  const [dismissFuture, setDismissFuture] = useState(false);
  return (
    <AccessibleModal
      title={attempt.rules.preview_title}
      closeBlocked={true}
      onClose={() => undefined}
      cardClassName="bonus-game-preview-modal"
    >
      <img
        className="bonus-game-preview-modal__artwork"
        src={attempt.rules.preview_artwork_url}
        alt={`Локация «${attempt.arena.title}» и её вратарь`}
      />
      <p className="modal-copy bonus-game-preview-modal__story">{attempt.rules.preview_story}</p>
      <p className="bonus-game-preview-modal__condition">
        {qualificationDescription(attempt.rules.qualification_rules)}
      </p>
      <label className="bonus-game-preview-modal__checkbox">
        <input
          type="checkbox"
          checked={dismissFuture}
          disabled={busy}
          onChange={(event) => setDismissFuture(event.target.checked)}
        />
        <span>Больше не показывать</span>
      </label>
      <div className="modal-actions">
        <button
          type="button"
          className="modal-primary btn btn--cta"
          disabled={busy}
          onClick={() => void onAcknowledge(dismissFuture)}
        >
          {busy ? 'Сохраняем…' : 'Понятно'}
        </button>
      </div>
    </AccessibleModal>
  );
}

function BonusBreakReady({
  attempt,
  busy,
  onStart,
}: {
  attempt: BonusGameAttempt;
  busy: boolean;
  onStart: () => void | Promise<unknown>;
}): JSX.Element {
  return (
    <AccessibleModal
      title="Перерыв окончен"
      copy={`Период ${attempt.current_period} завершён. Можно начинать период ${attempt.current_period + 1}.`}
      closeBlocked={true}
      onClose={() => undefined}
      cardClassName="bonus-game-break-modal"
    >
      <p className="bonus-game-break-progress">
        {qualificationProgress(attempt.rules.qualification_rules, {
          goals: attempt.goals,
          shots: attempt.shots_taken,
          currentStreak: attempt.current_goal_streak,
          bestStreak: attempt.best_goal_streak,
        })}
      </p>
      <div className="modal-actions">
        <button
          type="button"
          className="modal-primary btn btn--cta"
          disabled={busy}
          onClick={() => void onStart()}
        >
          {busy ? 'Начинаем…' : 'Начать следующий период'}
        </button>
      </div>
    </AccessibleModal>
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

function speedOverridesFor(
  rule: BonusPeriodRule,
  loadout: BonusGameAttempt['current_loadout'],
): SpeedOverrides {
  const effects = loadout?.items.map((item) => item.effects) ?? [];
  const sum = (key: keyof (typeof effects)[number]): number =>
    effects.reduce((total, effect) => total + effect[key], 0);
  return {
    goalFreq: Math.max(0.1, rule.goal_frequency + sum('goalFrequencyDelta')),
    goalieFreq: Math.max(0.1, rule.goalie_frequency + sum('goalieFrequencyDelta')),
    shooterFreq: Math.max(0.1, rule.shooter_frequency + sum('shooterFrequencyDelta')),
    puckSpeed: Math.max(0.2, rule.puck_speed_per_ms + sum('puckSpeedDelta')),
  };
}

function BonusInventoryPicker({
  selection,
  onChange,
  onCancel,
  onStart,
  busy,
}: {
  selection: BonusPeriodLoadoutSelection;
  onChange: (selection: BonusPeriodLoadoutSelection) => void;
  onCancel: () => void;
  onStart: () => void | Promise<unknown>;
  busy: boolean;
}): JSX.Element {
  const inventory = useQuery({ queryKey: ['inventory', 'me'], queryFn: fetchMyInventory });
  const kinds: Array<{ kind: InventoryEquipmentKind; label: string }> = [
    { kind: 'stick', label: 'Клюшка' },
    { kind: 'skates', label: 'Коньки' },
    { kind: 'nutrition', label: 'Питание' },
  ];
  return (
    <AccessibleModal
      title="Инвентарь на период"
      copy="Выбор необязателен. Пустой слот использует базовые параметры."
      closeBlocked={busy}
      onClose={onCancel}
      cardClassName="bonus-game-inventory-modal"
    >
      {inventory.isLoading ? <p className="modal-copy">Загружаем инвентарь…</p> : null}
      {inventory.isError ? <p className="modal-copy" role="alert">Не удалось загрузить инвентарь.</p> : null}
      <div className="bonus-game-inventory-fields">
        {kinds.map(({ kind, label }) => (
          <label key={kind}>
            <span>{label}</span>
            <select
              value={selection[kind] ?? ''}
              disabled={busy || inventory.isLoading}
              onChange={(event) =>
                onChange({ ...selection, [kind]: event.target.value || null })
              }
            >
              <option value="">Без предмета</option>
              {(inventory.data?.items[kind] ?? [])
                .filter((item) => item.chargesAvailable > 0)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} · {item.chargesAvailable}
                  </option>
                ))}
            </select>
          </label>
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={onCancel}>
          Назад
        </button>
        <button
          type="button"
          className="modal-primary btn btn--cta"
          disabled={busy || inventory.isLoading || inventory.isError}
          onClick={() => void onStart()}
        >
          {busy ? 'Начинаем…' : 'Начать период'}
        </button>
      </div>
    </AccessibleModal>
  );
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
  const acknowledgePreview = useBonusGameStore((state) => state.acknowledgePreview);
  const optimisticAddShot = useBonusGameStore((state) => state.optimisticAddShot);
  const submitShot = useBonusGameStore((state) => state.submitShot);
  const abandon = useBonusGameStore((state) => state.abandon);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [inventorySelection, setInventorySelection] = useState<BonusPeriodLoadoutSelection>({});
  const [isConfirmingAbandon, setIsConfirmingAbandon] = useState(false);
  const abandonRequestRef = useRef(false);
  const loadedRouteRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const isAuthoritativeBreak = attempt?.status === 'active' && attempt.state === 'break_active';

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

  useEffect(() => {
    if (!isAuthoritativeBreak) return;
    setConfirmAbandon(false);
  }, [isAuthoritativeBreak]);

  const goToCatalog = useCallback(() => navigate('/bonus-games'), [navigate]);
  const refreshAttempt = useCallback(async (): Promise<void> => {
    if (attempt) await loadAttempt(attempt.id);
  }, [attempt, loadAttempt]);
  const handleStartPeriod = useCallback(async (): Promise<BonusGameAttempt | null> => {
    if (inFlight) return null;
    const result = await startPeriod(attempt?.rules.use_inventory ? inventorySelection : undefined);
    if (result !== null) setInventoryOpen(false);
    return result;
  }, [attempt?.rules.use_inventory, inFlight, inventorySelection, startPeriod]);
  const requestStartPeriod = useCallback(async (): Promise<BonusGameAttempt | null> => {
    if (attempt?.rules.use_inventory) {
      setInventoryOpen(true);
      return null;
    }
    return await handleStartPeriod();
  }, [attempt?.rules.use_inventory, handleStartPeriod]);

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

  if (needsReconcile && attempt === null) {
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
  const isBreak = !isTerminal && attempt.state === 'break_active';
  const isIdle = attempt.state === 'idle';
  const isPeriodActive = attempt.state === 'period_active';
  const isBetweenPeriods = isIdle && attempt.current_period > 0;
  const previewRequired = !isTerminal && attempt.preview_required;
  const periodNumber =
    isIdle || isBreak
      ? Math.min(attempt.current_period + 1, attempt.rules.total_periods)
      : attempt.current_period;
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
  const scoreboardEndsAt =
    localPeriodEndsAt === undefined
      ? undefined
      : localPeriodEndsAt + futureBonusPeriodDurationMs(attempt);
  const idleTimerMs =
    attempt.rules.skill_code === 'speed'
      ? futureBonusPeriodDurationMs(attempt)
      : rule.duration_ms;
  const goalieConfig = goalieConfigFor(attempt, rule);
  const speedOverrides = speedOverridesFor(rule, attempt.current_loadout);
  const stickItem = attempt.current_loadout?.items.find((item) => item.kind === 'stick');
  const preloadAssets = [
    attempt.arena.artwork_url,
    attempt.goalkeeper_ready_url,
    attempt.goalkeeper_save_url,
  ];
  const clockRebaseKey = deriveBonusGameClockEpoch(attempt);
  const terminalShotsTotal = attempt.rules.periods.reduce(
    (total, period) => total + (period.shots_limit ?? 0),
    0,
  );

  return (
    <>
      <PlayView
        suppressedByModal={
          inventoryOpen || previewRequired || isBetweenPeriods || isBreak || isTerminal
        }
        showIceCar={isBreak || isTerminal}
        onBack={() => setConfirmAbandon(true)}
        backLabel="К бонусным играм"
        active={isPeriodActive}
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
        stickEffects={{
          ...STICK_NEUTRAL,
          shotZoneMultiplier: stickItem?.effects.shotZoneMultiplier ?? 1,
        }}
        goals={attempt.goals}
        shots={isTerminal ? attempt.shots_taken : attempt.current_period_shots_taken}
        shotsTotal={isTerminal ? terminalShotsTotal : (rule.shots_limit ?? undefined)}
        scoreboardNotice={qualificationProgress(attempt.rules.qualification_rules, {
          goals: attempt.goals,
          shots: attempt.shots_taken,
          currentStreak: attempt.current_goal_streak,
          bestStreak: attempt.best_goal_streak,
        })}
        timer={isTerminal ? '00:00' : isIdle ? formatCountdown(idleTimerMs) : undefined}
        shotButtonLabel={
          needsReconcile
            ? 'ПРОВЕРЯЕМ...'
            : isTerminal
              ? 'ИГРА ЗАВЕРШЕНА'
              : isBreak
                ? 'ЛЁД ГОТОВИТСЯ'
                : isIdle
                  ? inFlight
                    ? 'НАЧИНАЕМ...'
                    : 'НАЧАТЬ'
                  : undefined
        }
        primaryActionBlocked={needsReconcile}
        inactiveAction={
          isIdle && !isBetweenPeriods && !previewRequired ? requestStartPeriod : undefined
        }
        entranceBeforeInactiveAction={true}
        sessionStartedAt={attempt.period_started_at}
        serverNow={attempt.server_now}
        receivedAtPerformanceMs={receivedAtPerformanceMs ?? undefined}
        initialSceneElapsedMs={clockBasis.sceneElapsedMs}
        initialShooterElapsedMs={clockBasis.shooterElapsedMs}
        clockRebaseKey={clockRebaseKey}
        periodEndsAt={localPeriodEndsAt}
        scoreboardEndsAt={scoreboardEndsAt}
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
        overlayControls={
          needsReconcile ? (
            <BonusReconcileOverlay loading={loading} onRetry={() => void reconcileAttempt()} />
          ) : undefined
        }
        longCourtBackground={attempt.arena.artwork_url}
        rinkBorderRadius={28}
      />

      {terminalKind ? (
        <BonusResult kind={terminalKind} attempt={attempt} onCatalog={goToCatalog} />
      ) : null}

      {previewRequired ? (
        <BonusPreview attempt={attempt} busy={inFlight} onAcknowledge={acknowledgePreview} />
      ) : null}

      {isBreak ? (
        <BonusBreak
          attempt={attempt}
          receivedAtPerformanceMs={receivedAtPerformanceMs}
          onElapsed={refreshAttempt}
        />
      ) : null}

      {isBetweenPeriods && !previewRequired ? (
        <BonusBreakReady attempt={attempt} busy={inFlight} onStart={requestStartPeriod} />
      ) : null}

      {inventoryOpen && !previewRequired && !isBreak && !isTerminal ? (
        <BonusInventoryPicker
          selection={inventorySelection}
          onChange={setInventorySelection}
          onCancel={() => setInventoryOpen(false)}
          onStart={handleStartPeriod}
          busy={inFlight}
        />
      ) : null}

      {confirmAbandon && !isBreak && !isTerminal ? (
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
