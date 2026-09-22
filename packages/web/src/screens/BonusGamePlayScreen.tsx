import { useCallback, useEffect, useRef, useState } from 'react';
import {
  classifyMarksmanshipShot,
  GOAL_OPENING,
  PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE,
  PERSPECTIVE_COURT_GOALIE_VISUAL_Y_OFFSET,
  PERSPECTIVE_COURT_VISUAL_Y_SCALE,
  PUCK_START,
  STICK_NEUTRAL,
  type GoalieConfig,
  type MarksmanshipDifficultyCode,
  type MarksmanshipShotClassification,
  type MarksmanshipSeriesGoal,
} from '@hockey/game-core';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleDollarSign, Star, Target, TrendingUp } from 'lucide-react';
import type {
  BonusGameAttempt,
  BonusPeriodLoadoutSelection,
  BonusPeriodRule,
  MarksmanshipScoreDetails,
} from '../api/bonusGames.js';
import { startBonusAttempt } from '../api/bonusGames.js';
import { fetchMyInventory, type InventoryEquipmentKind } from '../api/inventory.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
import type { GameScoreboardModel } from '../components/ScoreBoard.js';
import { PlayView, type PlayResultPresentation } from '../game/PlayView.js';
import {
  deriveBonusGameClockBasis,
  deriveBonusGameClockEpoch,
  deriveEnduranceClock,
  futureBonusPeriodDurationMs,
} from '../game/bonusGameTiming.js';
import type { SpeedOverrides } from '../game/loop.js';
import type { GoalieOptions } from '../game/renderer/Goalie.js';
import { useBonusGameStore } from '../stores/bonusGameStore.js';
import { formatRussianCount } from '../lib/russianPlural.js';
import { useOnboardingGate } from '../onboarding/OnboardingGate.js';
import {
  enduranceQualificationLines,
  qualificationDescription,
  qualificationProgress,
} from '../game/bonusGameQualification.js';
import { versionBonusGameArtwork, versionBonusGameGoalkeeper } from '../game/bonusGameArtwork.js';

const BONUS_GAME_GOALIE_OPTIONS: Omit<GoalieOptions, 'idleSpriteUrl' | 'saveSpriteUrl'> = {
  visualYScale: PERSPECTIVE_COURT_VISUAL_Y_SCALE,
  visualYOffset: PERSPECTIVE_COURT_GOALIE_VISUAL_Y_OFFSET,
  visualXScale: PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE,
  sizeScale: 1.134,
  idleSizeScale: 1.22,
  saveSizeScale: 0.96,
  saveVisualYOffset: 10,
};

const AMATEUR_GOALKEEPER_READY_URL = '/sprites/test-goalie-black.webp';
const AMATEUR_GOALKEEPER_SAVE_URL = '/sprites/test-goalie-black-save.webp';

// PlayView normally applies the deferred server DTO at the end of the puck animation.
// Keep a screen-level fallback so a throttled/lost animation callback cannot leave the
// accepted shot locked forever and prevent the next (possibly qualifying) shot.
const BONUS_PENDING_SHOT_FALLBACK_PADDING_MS = 1_250;
const BONUS_PENDING_SHOT_FALLBACK_MIN_DELAY_MS = 250;

function bonusGoalieOptions(attempt: BonusGameAttempt): GoalieOptions {
  const usesEnduranceAmateurGoalkeeper = attempt.rules.skill_code === 'endurance';
  return {
    ...BONUS_GAME_GOALIE_OPTIONS,
    idleSpriteUrl: usesEnduranceAmateurGoalkeeper
      ? AMATEUR_GOALKEEPER_READY_URL
      : versionBonusGameGoalkeeper(attempt.goalkeeper_ready_url),
    saveSpriteUrl: usesEnduranceAmateurGoalkeeper
      ? AMATEUR_GOALKEEPER_SAVE_URL
      : versionBonusGameGoalkeeper(attempt.goalkeeper_save_url),
  };
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1_000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function formatTenths(ms: number): string {
  return (Math.ceil(Math.max(0, ms) / 100) / 10).toFixed(1).replace('.', ',');
}

function formatPoints(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value).replaceAll('\u00a0', ' ');
}

function marksmanshipDifficultyLabel(code: MarksmanshipDifficultyCode): string {
  switch (code) {
    case 'open':
      return 'Открытое окно';
    case 'timed':
      return 'Точный момент';
    case 'precise':
      return 'Точное окно';
    case 'narrow':
      return 'Сложное окно';
    case 'very_narrow':
      return 'Узкое окно';
    case 'instant':
      return 'Мгновенное окно';
  }
}

function marksmanshipResultPresentation(input: {
  serverResult: 'goal' | 'save' | 'miss';
  awardedPoints: number;
  difficultyCode: MarksmanshipDifficultyCode | null;
  counterDirection: boolean;
  scoreDetails?: MarksmanshipScoreDetails | null;
}): PlayResultPresentation | null {
  const details = input.scoreDetails;
  if (input.serverResult !== 'goal') {
    if (details?.version !== 2) return null;
    if (details.opportunity === 'human_error' && details.timingErrorMs !== null) {
      const direction = details.timingErrorMs > 0 ? 'раньше' : 'позже';
      return {
        title: input.serverResult === 'save' ? 'СЭЙВ' : 'МИМО',
        details: ['Момент был', `Бросок на ${Math.abs(details.timingErrorMs)} мс ${direction}`],
      };
    }
    if (details.opportunity === 'closed') {
      return {
        title: input.serverResult === 'save' ? 'СЭЙВ' : 'МИМО',
        details: ['Закрытая ситуация', 'Голевого окна не было'],
      };
    }
    return null;
  }
  if (input.awardedPoints <= 0 || input.difficultyCode === null) return null;
  const technique =
    details?.version === 2 && details.series.type === 'triple'
      ? 'Тройка · 3 гола за один прокат'
      : details?.version === 2 && details.series.type === 'double'
        ? 'Двойка · 2 гола за один прокат'
        : details?.version === 2 && details.geometry.behindGoalie
          ? `За вратаря${details.counterDirection ? ' · противоход' : ''}`
          : input.counterDirection
            ? 'Точный момент · противоход'
            : marksmanshipDifficultyLabel(input.difficultyCode);
  const breakdown =
    details?.version === 2
      ? [
          `${input.awardedPoints - details.seriesBonus - details.situationBonus} за точность`,
          ...(details.seriesBonus > 0 ? [`+${details.seriesBonus} серия`] : []),
          ...(details.situationBonus > 0 ? [`+${details.situationBonus} ситуация`] : []),
        ].join(' · ')
      : null;
  return {
    title: 'ГОЛ',
    details: [
      `+${input.awardedPoints}`,
      technique,
      ...(breakdown === null ? [] : [breakdown]),
    ],
  };
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
      copy="До следующего периода"
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
  return (
    <AccessibleModal
      title={attempt.rules.preview_title}
      closeBlocked={true}
      onClose={() => undefined}
      cardClassName="bonus-game-preview-modal"
    >
      <img
        className="bonus-game-preview-modal__artwork"
        src={versionBonusGameArtwork(attempt.rules.preview_artwork_url)}
        alt={`Локация «${attempt.arena.title}» и её вратарь`}
      />
      <p className="modal-copy bonus-game-preview-modal__story">{attempt.rules.preview_story}</p>
      <p className="bonus-game-preview-modal__condition">
        <Target
          className="bonus-game-preview-modal__condition-icon"
          size={17}
          strokeWidth={2.4}
          aria-hidden="true"
        />
        {attempt.rules.qualification_rules.type === 'survive_goal_windows' ? (
          <span className="bonus-game-preview-modal__condition-lines">
            {enduranceQualificationLines(attempt.rules.qualification_rules).map((line) => (
              <span key={line}>{line}</span>
            ))}
          </span>
        ) : (
          qualificationDescription(attempt.rules.qualification_rules)
        )}
      </p>
      <div className="modal-actions">
        <button
          type="button"
          className="modal-primary btn btn--cta"
          disabled={busy}
          onClick={() => void onAcknowledge(false)}
        >
          {busy ? 'Сохраняем…' : 'К игре'}
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
  onRetry,
  retrying,
  survivedTimeMs,
}: {
  kind: 'failed' | 'completed' | 'abandoned';
  attempt: BonusGameAttempt;
  onCatalog: () => void;
  onRetry: () => void;
  retrying: boolean;
  survivedTimeMs?: number;
}): JSX.Element {
  const title = kind === 'completed' ? 'Игра пройдена' : 'Попытка завершена';
  const enduranceRules =
    attempt.rules.qualification_rules.type === 'survive_goal_windows'
      ? attempt.rules.qualification_rules
      : null;
  let copy: string;
  if (kind === 'failed') copy = enduranceRules ? 'Не успел забить' : 'Цель не достигнута';
  else if (kind === 'abandoned') copy = 'Прогресс попытки потерян';
  else if (attempt.reward_granted) copy = 'Награда за первое прохождение';
  else copy = 'Повтор завершён без награды';
  const accuracy =
    attempt.shots_taken > 0 ? Math.round((attempt.goals / attempt.shots_taken) * 100) : 0;
  const marksmanshipRules =
    attempt.rules.qualification_rules.type === 'points_in_time'
      ? attempt.rules.qualification_rules
      : null;
  const periodStartedAtMs = Date.parse(attempt.period_started_at ?? '');
  const closedAtMs = Date.parse(attempt.closed_at ?? '');
  const derivedSurvivedTimeMs =
    Number.isFinite(periodStartedAtMs) && Number.isFinite(closedAtMs)
      ? Math.max(0, closedAtMs - periodStartedAtMs)
      : survivedTimeMs;
  const enduranceDurationMs =
    enduranceRules === null
      ? null
      : kind === 'completed'
        ? enduranceRules.activeTimeMs
        : Math.min(enduranceRules.activeTimeMs, derivedSurvivedTimeMs ?? 0);
  const rewardParts = [
    attempt.reward.coins > 0
      ? {
          label: 'Монеты',
          value: attempt.reward.coins,
          text: formatRussianCount(attempt.reward.coins, 'монета', 'монеты', 'монет'),
          tone: 'coin' as const,
          icon: <CircleDollarSign size={15} strokeWidth={2.4} aria-hidden="true" />,
        }
      : null,
    attempt.reward.stars > 0
      ? {
          label: 'Звёзды',
          value: attempt.reward.stars,
          text: formatRussianCount(attempt.reward.stars, 'звезда', 'звезды', 'звёзд'),
          tone: 'star' as const,
          icon: <Star size={15} fill="currentColor" strokeWidth={2.4} aria-hidden="true" />,
        }
      : null,
    attempt.reward.experience > 0
      ? {
          label: 'Опыт',
          value: attempt.reward.experience,
          text: formatRussianCount(
            attempt.reward.experience,
            'очко опыта',
            'очка опыта',
            'очков опыта',
          ),
          tone: 'experience' as const,
          icon: <TrendingUp size={15} strokeWidth={2.4} aria-hidden="true" />,
        }
      : null,
  ].filter((part): part is NonNullable<typeof part> => part !== null);

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
      {enduranceRules && enduranceDurationMs !== null ? (
        <div
          className="bonus-game-result-metrics bonus-game-result-metrics--endurance"
          aria-label={`Время ${formatCountdown(enduranceDurationMs)}, голов ${attempt.goals}`}
        >
          <BonusResultMetric
            label={kind === 'completed' ? 'Время' : 'Продержался'}
            value={formatCountdown(enduranceDurationMs)}
          />
          <BonusResultMetric label="Голы" value={String(attempt.goals)} />
        </div>
      ) : marksmanshipRules ? (
        <div
          className="bonus-game-result-metrics"
          aria-label={`Итого: ${attempt.total_points} очков, цель ${marksmanshipRules.targetPoints}`}
        >
          <BonusResultMetric label="Набрано" value={formatPoints(attempt.total_points)} />
          <BonusResultMetric label="Цель" value={formatPoints(marksmanshipRules.targetPoints)} />
          <BonusResultMetric
            label="Не хватило"
            value={formatPoints(Math.max(0, marksmanshipRules.targetPoints - attempt.total_points))}
          />
        </div>
      ) : (
        <div
          className="bonus-game-result-metrics"
          aria-label={`Итого: ${attempt.goals} голов из ${attempt.shots_taken} бросков, точность ${accuracy}%`}
        >
          <BonusResultMetric label="Голы" value={String(attempt.goals)} />
          <BonusResultMetric label="Броски" value={String(attempt.shots_taken)} />
          <BonusResultMetric label="Точность" value={`${accuracy}%`} />
        </div>
      )}
      {kind === 'completed' && attempt.reward_granted && rewardParts.length > 0 ? (
        <div className="bonus-game-result-reward">
          <span className="bonus-game-result-reward-label">Награда</span>
          <div className="bonus-game-result-reward-values">
            {rewardParts.map((part) => (
              <span
                key={part.tone}
                className="bonus-game-result-reward-value"
                aria-label={`${part.label}: ${part.value}`}
                style={{ color: `var(--reward-${part.tone})` }}
              >
                {part.icon}
                {part.text}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <div className="modal-actions bonus-game-result-actions">
        {kind === 'failed' && marksmanshipRules ? (
          <button type="button" className="btn btn--ghost" disabled={retrying} onClick={onRetry}>
            {retrying ? 'Начинаем…' : 'Повторить'}
          </button>
        ) : null}
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
      {inventory.isError ? (
        <p className="modal-copy" role="alert">
          Не удалось загрузить инвентарь.
        </p>
      ) : null}
      <div className="bonus-game-inventory-fields">
        {kinds.map(({ kind, label }) => (
          <label key={kind}>
            <span>{label}</span>
            <select
              value={selection[kind] ?? ''}
              disabled={busy || inventory.isLoading}
              onChange={(event) => onChange({ ...selection, [kind]: event.target.value || null })}
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
  const { refreshAfterGameExit } = useOnboardingGate();
  const queryClient = useQueryClient();
  const { gameId } = useParams<{ gameId: string }>();
  const [searchParams] = useSearchParams();
  const routeAttemptId = searchParams.get('attempt');
  const attempt = useBonusGameStore((state) => state.attempt);
  const loading = useBonusGameStore((state) => state.loading);
  const error = useBonusGameStore((state) => state.error);
  const errorHandledByAmateurToast = useBonusGameStore((state) => state.errorHandledByAmateurToast);
  const inFlight = useBonusGameStore((state) => state.inFlight);
  const needsReconcile = useBonusGameStore((state) => state.needsReconcile);
  const receivedAtPerformanceMs = useBonusGameStore((state) => state.receivedAtPerformanceMs);
  const pendingShot = useBonusGameStore((state) => state.pendingShot);
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
  const [isRetrying, setIsRetrying] = useState(false);
  const [enduranceEntranceAttemptId, setEnduranceEntranceAttemptId] = useState<string | null>(null);
  const abandonRequestRef = useRef(false);
  const loadedRouteRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const predictedMarksmanshipRef = useRef<{
    shotIndex: number;
    classification: MarksmanshipShotClassification;
  } | null>(null);
  const earliestMarksmanshipTapRef = useRef(0);
  const marksmanshipGoalInputsRef = useRef<MarksmanshipSeriesGoal[]>([]);
  const lastEnduranceElapsedMsRef = useRef<number | undefined>(undefined);
  const isAuthoritativeBreak = attempt?.status === 'active' && attempt.state === 'break_active';

  useEffect(() => {
    predictedMarksmanshipRef.current = null;
    earliestMarksmanshipTapRef.current = 0;
    marksmanshipGoalInputsRef.current = [];
  }, [attempt?.current_period, attempt?.id]);

  useEffect(() => {
    if (pendingShot === null) return;
    const pendingAttempt = pendingShot.attempt;
    const pendingRule = ruleForPeriod(pendingAttempt, pendingAttempt.current_period);
    if (pendingRule === null) return;
    const puckSpeed = speedOverridesFor(pendingRule, pendingAttempt.current_loadout).puckSpeed;
    const flightMs = (PUCK_START.y - GOAL_OPENING.y) / puckSpeed;
    const applyAtPerformanceMs =
      pendingShot.receivedAtPerformanceMs + flightMs + BONUS_PENDING_SHOT_FALLBACK_PADDING_MS;
    const delayMs = Math.max(
      BONUS_PENDING_SHOT_FALLBACK_MIN_DELAY_MS,
      applyAtPerformanceMs - performance.now(),
    );
    const timeoutId = window.setTimeout(() => {
      const currentPending = useBonusGameStore.getState().pendingShot;
      if (currentPending?.attempt !== pendingAttempt) return;
      applyPendingShot(pendingAttempt);
    }, delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [applyPendingShot, pendingShot]);

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

  const navigateToCatalog = useCallback(() => navigate('/bonus-games'), [navigate]);
  const leavePlaySurface = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['bonus-games'], refetchType: 'none' });
    void queryClient.invalidateQueries({ queryKey: ['weekly-challenge'] });
    void queryClient.invalidateQueries({ queryKey: ['achievements'] });
    navigate('/bonus-games');
    void refreshAfterGameExit();
  }, [navigate, queryClient, refreshAfterGameExit]);
  useEffect(() => {
    if (!isAuthoritativeBreak) return;
    setConfirmAbandon(false);
  }, [isAuthoritativeBreak]);

  const refreshAttempt = useCallback(async (): Promise<void> => {
    if (attempt) await loadAttempt(attempt.id);
  }, [attempt, loadAttempt]);
  const activeEnduranceAttempt =
    attempt?.status === 'active' &&
    attempt.state === 'period_active' &&
    attempt.rules.qualification_rules.type === 'survive_goal_windows'
      ? attempt
      : null;
  const recordEnduranceClock = useCallback(
    (totalRemainingMs: number): void => {
      if (activeEnduranceAttempt === null) return;
      const enduranceRules = activeEnduranceAttempt.rules.qualification_rules;
      if (enduranceRules.type !== 'survive_goal_windows') return;
      lastEnduranceElapsedMsRef.current = Math.max(
        0,
        enduranceRules.activeTimeMs - totalRemainingMs,
      );
    },
    [activeEnduranceAttempt],
  );
  const [enduranceClock, setEnduranceClock] = useState<ReturnType<
    typeof deriveEnduranceClock
  > | null>(null);
  const [enduranceGoalTimerPaused, setEnduranceGoalTimerPaused] = useState(false);
  const frozenEnduranceGoalMsRef = useRef<number | null>(null);
  const enduranceElapsedRequestedRef = useRef(false);
  useEffect(() => {
    enduranceElapsedRequestedRef.current = false;
  }, [
    activeEnduranceAttempt?.id,
    activeEnduranceAttempt?.period_ends_at,
    activeEnduranceAttempt?.goal_window_ends_at,
  ]);
  useEffect(() => {
    if (activeEnduranceAttempt === null) {
      setEnduranceClock(null);
      frozenEnduranceGoalMsRef.current = null;
      return;
    }
    const receivedAt = receivedAtPerformanceMs ?? performance.now();
    const update = (): void => {
      const authoritativeClock = deriveEnduranceClock(
        activeEnduranceAttempt,
        receivedAt,
        performance.now(),
      );
      const nextClock = enduranceGoalTimerPaused
        ? {
            ...authoritativeClock,
            goalRemainingMs: frozenEnduranceGoalMsRef.current ?? authoritativeClock.goalRemainingMs,
          }
        : authoritativeClock;
      setEnduranceClock(nextClock);
      recordEnduranceClock(authoritativeClock.totalRemainingMs);
      const deadlineElapsed =
        authoritativeClock.totalRemainingMs === 0 ||
        (!enduranceGoalTimerPaused && authoritativeClock.goalRemainingMs === 0);
      if (!enduranceElapsedRequestedRef.current && deadlineElapsed) {
        enduranceElapsedRequestedRef.current = true;
        void refreshAttempt();
      }
    };
    update();
    const intervalId = window.setInterval(update, 100);
    return () => window.clearInterval(intervalId);
  }, [
    activeEnduranceAttempt,
    enduranceGoalTimerPaused,
    receivedAtPerformanceMs,
    recordEnduranceClock,
    refreshAttempt,
  ]);
  const handleEnduranceResultVisibility = useCallback(
    (visible: boolean): void => {
      if (visible && activeEnduranceAttempt !== null) {
        const receivedAt = receivedAtPerformanceMs ?? performance.now();
        const currentClock =
          enduranceClock ??
          deriveEnduranceClock(activeEnduranceAttempt, receivedAt, performance.now());
        frozenEnduranceGoalMsRef.current = currentClock.goalRemainingMs;
      } else {
        frozenEnduranceGoalMsRef.current = null;
      }
      setEnduranceGoalTimerPaused(visible);
    },
    [activeEnduranceAttempt, enduranceClock, receivedAtPerformanceMs],
  );
  useEffect(() => {
    if (activeEnduranceAttempt === null) return;
    const reconcile = (): void => {
      void loadAttempt(activeEnduranceAttempt.id);
    };
    const reconcileWhenVisible = (): void => {
      if (document.visibilityState === 'visible') reconcile();
    };
    window.addEventListener('online', reconcile);
    document.addEventListener('visibilitychange', reconcileWhenVisible);
    return () => {
      window.removeEventListener('online', reconcile);
      document.removeEventListener('visibilitychange', reconcileWhenVisible);
    };
  }, [activeEnduranceAttempt, loadAttempt]);
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
    const result = await handleStartPeriod();
    if (result === null) setEnduranceEntranceAttemptId(null);
    return result;
  }, [attempt?.rules.use_inventory, handleStartPeriod]);

  const confirmAndAbandon = useCallback(async (): Promise<void> => {
    if (abandonRequestRef.current) return;
    abandonRequestRef.current = true;
    setIsConfirmingAbandon(true);
    const result = await abandon();
    if (result?.status === 'abandoned') {
      await queryClient.invalidateQueries({ queryKey: ['bonus-games'] });
      leavePlaySurface();
      return;
    }
    abandonRequestRef.current = false;
    setIsConfirmingAbandon(false);
  }, [abandon, leavePlaySurface, queryClient]);

  const retryAttempt = useCallback(async (): Promise<void> => {
    if (isRetrying || attempt === null) return;
    setIsRetrying(true);
    try {
      const response = await startBonusAttempt(attempt.game_id);
      useBonusGameStore.getState().applyState(response.attempt);
      navigate(
        `/bonus-games/${response.attempt.game_id}/play?attempt=${encodeURIComponent(response.attempt.id)}`,
        { replace: true },
      );
    } finally {
      setIsRetrying(false);
    }
  }, [attempt, isRetrying, navigate]);

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
        onAction={navigateToCatalog}
      />
    );
  }
  if (attempt.game_id !== gameId) {
    return (
      <ModeState
        role="alert"
        text="Открыта другая бонусная попытка. Вернитесь в каталог."
        actionLabel="К бонусным играм"
        onAction={navigateToCatalog}
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
    attempt.rules.skill_code === 'speed' ? futureBonusPeriodDurationMs(attempt) : rule.duration_ms;
  const goalieConfig = goalieConfigFor(attempt, rule);
  const speedOverrides = speedOverridesFor(rule, attempt.current_loadout);
  const stickItem = attempt.current_loadout?.items.find((item) => item.kind === 'stick');
  const arenaArtworkUrl = versionBonusGameArtwork(attempt.arena.artwork_url);
  const goalieOptions = bonusGoalieOptions(attempt);
  const preloadAssets = [
    arenaArtworkUrl,
    goalieOptions.idleSpriteUrl!,
    goalieOptions.saveSpriteUrl!,
  ];
  const clockRebaseKey = deriveBonusGameClockEpoch(attempt);
  const terminalShotsTotal = attempt.rules.periods.reduce(
    (total, period) => total + (period.shots_limit ?? 0),
    0,
  );
  const marksmanshipRules =
    attempt.rules.qualification_rules.type === 'points_in_time'
      ? attempt.rules.qualification_rules
      : null;
  const isMarksmanship = marksmanshipRules !== null;
  const isEndurance = attempt.rules.qualification_rules.type === 'survive_goal_windows';
  const marksmanshipTarget = marksmanshipRules?.targetPoints ?? null;
  const enduranceRules =
    attempt.rules.qualification_rules.type === 'survive_goal_windows'
      ? attempt.rules.qualification_rules
      : null;
  const showEnduranceTimer =
    isEndurance &&
    (isPeriodActive || (isIdle && enduranceEntranceAttemptId === attempt.id));
  const visibleEnduranceClock =
    activeEnduranceAttempt === null
      ? null
      : (enduranceClock ??
        deriveEnduranceClock(
          activeEnduranceAttempt,
          receivedAtPerformanceMs ?? performance.now(),
          performance.now(),
        ));
  const enduranceScoreboardModel:
    | ((counters: { goals: number; shots: number }) => GameScoreboardModel)
    | undefined =
    enduranceRules === null
      ? undefined
      : ({ goals: visibleGoals, shots: visibleShots }) => ({
          rows: [
            {
              id: 'summary',
              metrics: [
                { id: 'period', label: 'ПЕРИОД', value: `${periodNumber}/1` },
                {
                  id: 'goals',
                  label: 'ГОЛЫ',
                  value: String(visibleGoals),
                },
                {
                  id: 'shots',
                  label: 'БРОСКИ',
                  value: String(visibleShots),
                },
                {
                  id: 'total-time',
                  label: 'ВРЕМЯ',
                  value: formatCountdown(
                    visibleEnduranceClock?.totalRemainingMs ?? enduranceRules.activeTimeMs,
                  ),
                  tone: 'timer',
                },
              ],
            },
          ],
        });

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
        goalieOptions={goalieOptions}
        preloadAssets={preloadAssets}
        periodNumber={periodNumber}
        periodsTotal={attempt.rules.total_periods}
        speedOverrides={speedOverrides}
        stickEffects={{
          ...STICK_NEUTRAL,
          shotZoneMultiplier: stickItem?.effects.shotZoneMultiplier ?? 1,
        }}
        goals={attempt.goals}
        shots={attempt.shots_taken}
        shotIndexBase={attempt.current_period_shots_taken}
        shotsTotal={terminalShotsTotal > 0 ? terminalShotsTotal : undefined}
        scoreboardNotice={
          isEndurance
            ? undefined
            : marksmanshipTarget === null
              ? qualificationProgress(attempt.rules.qualification_rules, {
                  goals: attempt.goals,
                  shots: attempt.shots_taken,
                  totalPoints: attempt.total_points,
                  currentStreak: attempt.current_goal_streak,
                  bestStreak: attempt.best_goal_streak,
                })
              : `${formatPoints(attempt.total_points)} / ${formatPoints(marksmanshipTarget)}`
        }
        scoreboardModel={enduranceScoreboardModel}
        scoreboardAccessory={
          showEnduranceTimer ? (
            <div
              className={`game-scoreboard game-scoreboard--stable-surface bonus-game-endurance-timer bonus-game-endurance-timer--${
                (visibleEnduranceClock?.goalRemainingMs ?? enduranceRules!.goalWindowMs) <= 4_000
                  ? 'danger'
                  : (visibleEnduranceClock?.goalRemainingMs ?? enduranceRules!.goalWindowMs) <=
                      10_000
                    ? 'warning'
                    : 'success'
              }`}
              role="timer"
              aria-label="До обязательного гола"
            >
              <span className="game-scoreboard__label">ТАЙМЕР</span>
              <span className="bonus-game-endurance-timer__value">
                {formatTenths(
                  visibleEnduranceClock?.goalRemainingMs ?? enduranceRules!.goalWindowMs,
                )}
              </span>
            </div>
          ) : undefined
        }
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
        onInactiveActionStart={
          isEndurance ? () => setEnduranceEntranceAttemptId(attempt.id) : undefined
        }
        entranceBeforeInactiveAction={true}
        goalsOnlyWhileInactive={true}
        sessionStartedAt={attempt.period_started_at}
        serverNow={attempt.server_now}
        receivedAtPerformanceMs={receivedAtPerformanceMs ?? undefined}
        initialSceneElapsedMs={clockBasis.sceneElapsedMs}
        initialShooterElapsedMs={clockBasis.shooterElapsedMs}
        clockRebaseKey={clockRebaseKey}
        periodEndsAt={localPeriodEndsAt}
        scoreboardEndsAt={scoreboardEndsAt}
        onTimerExpired={isPeriodActive && !isEndurance ? refreshAttempt : undefined}
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
            {
              deferApply: true,
              ...(isMarksmanship
                ? {
                    predictedMarksmanship:
                      predictedMarksmanshipRef.current?.shotIndex === shotIndex
                        ? predictedMarksmanshipRef.current.classification
                        : null,
                  }
                : {}),
            },
          );
          if (!mountedRef.current) applyPendingShot();
          return result
            ? {
                serverResult: result.serverResult,
                state: result.attempt,
                resultPresentation: isMarksmanship
                  ? marksmanshipResultPresentation({
                      serverResult: result.serverResult,
                      awardedPoints: result.awardedPoints,
                      difficultyCode: result.difficultyCode,
                      counterDirection: result.counterDirection,
                      scoreDetails: result.scoreDetails,
                    })
                  : undefined,
                ...(result.isCurrent === undefined ? {} : { isCurrent: result.isCurrent }),
              }
            : null;
        }}
        onShotResolved={
          isMarksmanship
            ? (context) => {
                const classification = classifyMarksmanshipShot({
                  shotInput: context.input,
                  goalie: context.goalieConfig,
                  seed: context.seed,
                  shotIndex: context.shotIndex,
                  phaseOffsets: context.phaseOffsets,
                  earliestTapTime: earliestMarksmanshipTapRef.current,
                  scoring: marksmanshipRules!.scoring,
                  previousGoals: marksmanshipGoalInputsRef.current,
                });
                predictedMarksmanshipRef.current = {
                  shotIndex: context.shotIndex,
                  classification,
                };
                earliestMarksmanshipTapRef.current =
                  context.input.tapTime +
                  (PUCK_START.y - GOAL_OPENING.y) /
                    (context.input.puckSpeedPerMs ?? speedOverrides.puckSpeed);
                if (classification.result.type === 'goal') {
                  marksmanshipGoalInputsRef.current = [
                    ...marksmanshipGoalInputsRef.current,
                    {
                      tapTime: context.input.tapTime,
                      shooterTapTime: context.input.shooterTapTime ?? context.input.tapTime,
                    },
                  ];
                }
                return marksmanshipResultPresentation({
                  serverResult: classification.result.type,
                  awardedPoints: classification.awardedPoints,
                  difficultyCode: classification.difficultyCode,
                  counterDirection: classification.counterDirection,
                  scoreDetails: {
                    version: 2,
                    windowDurationMs: classification.windowDurationMs,
                    difficultyCode: classification.difficultyCode,
                    counterDirection: classification.counterDirection,
                    opportunity: classification.opportunity,
                    timingErrorMs: classification.timingErrorMs,
                    geometry: classification.geometry,
                    series: classification.series,
                    situationBonus: classification.situationBonus,
                    seriesBonus: classification.seriesBonus,
                  },
                });
              }
            : undefined
        }
        resultCopy={isMarksmanship ? { goal: 'ГОЛ', save: 'СЭЙВ', miss: 'МИМО' } : undefined}
        onResultVisibilityChange={
          isEndurance && isPeriodActive ? handleEnduranceResultVisibility : undefined
        }
        applyState={() => undefined}
        applyResolvedState={(next) => applyPendingShot(next)}
        overlayControls={
          needsReconcile ? (
            <BonusReconcileOverlay loading={loading} onRetry={() => void reconcileAttempt()} />
          ) : undefined
        }
        longCourtBackground={arenaArtworkUrl}
        rinkBorderRadius={28}
      />

      {terminalKind ? (
        <BonusResult
          kind={terminalKind}
          attempt={attempt}
          onCatalog={leavePlaySurface}
          onRetry={() => void retryAttempt()}
          retrying={isRetrying}
          {...(lastEnduranceElapsedMsRef.current === undefined
            ? {}
            : { survivedTimeMs: lastEnduranceElapsedMsRef.current })}
        />
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
          copy="При выходе текущая попытка завершится, а прогресс потеряется."
          closeBlocked={isConfirmingAbandon}
          onClose={() => setConfirmAbandon(false)}
        >
          {error && !errorHandledByAmateurToast ? (
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
              Остаться
            </button>
            <button
              type="button"
              className="modal-primary btn btn--cta"
              disabled={isConfirmingAbandon}
              onClick={() => void confirmAndAbandon()}
            >
              {isConfirmingAbandon ? 'Выходим…' : 'Выйти'}
            </button>
          </div>
        </AccessibleModal>
      ) : null}
    </>
  );
}
