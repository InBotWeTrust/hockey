import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { Container } from 'pixi.js';
import type { Application, Ticker } from 'pixi.js';
import { ArrowLeft, BarChart3, ChevronRight, Home, Info, VolumeX, X } from 'lucide-react';
import {
  GOALIE_SIZE,
  GOALIE_Y,
  GOAL_OPENING,
  PUCK_START,
  RINK,
  SHOOTER_AMPLITUDE,
  SHOOTER_CENTER_X,
  STICK_NEUTRAL,
  deriveShotSeed,
  getDailyPeriodSpeedPreset,
  getGoalie,
  getSessionPhaseOffsets,
  resolveShot,
  simulateGoal,
  simulateGoalie,
  type DailyPeriodSpeedPreset,
  type GoalieConfig,
  type SessionPhaseOffsets,
  type ShotInput,
  type ShotResult,
  type StickEffects,
} from '@hockey/game-core';
import { PixiStage } from '../game/PixiStage.js';
import { RinkSvg } from '../game/RinkSvg.js';
import { Goal, type GoalOptions } from '../game/renderer/Goal.js';
import { Goalie, type GoalieOptions } from '../game/renderer/Goalie.js';
import { Hitboxes, type HitboxesOptions } from '../game/renderer/Hitboxes.js';
import { IceCar, iceCarPosAt } from '../game/renderer/IceCar.js';
import { Player, type PlayerOptions } from '../game/renderer/Player.js';
import { Puck, type PuckOptions } from '../game/renderer/Puck.js';
import { createGameLoop, type GameLoop, type SpeedOverrides } from '../game/loop.js';
import type { Scale } from '../game/coords.js';
import {
  TRAINING_NEW_COURT_BACKGROUND,
  TRAINING_NEW_COURT_BG_CROP_BOTTOM,
  TRAINING_NEW_COURT_GOALIE_VISUAL_X_SCALE,
  TRAINING_NEW_COURT_GOALIE_VISUAL_Y_OFFSET,
  TRAINING_NEW_COURT_GOAL_VISUAL_OFFSET_X_SCALE,
  TRAINING_NEW_COURT_GOAL_VISUAL_Y_OFFSET,
  TRAINING_NEW_COURT_HITBOX_GOALIE_HEIGHT_SCALE,
  TRAINING_NEW_COURT_HITBOX_GOALIE_INSET,
  TRAINING_NEW_COURT_HITBOX_GOALIE_WIDTH_SCALE,
  TRAINING_NEW_COURT_HITBOX_GOAL_HEIGHT_SCALE,
  TRAINING_NEW_COURT_HITBOX_GOAL_INSET,
  TRAINING_NEW_COURT_HITBOX_GOAL_WIDTH_SCALE,
  TRAINING_NEW_COURT_PUCK_BLADE_OFFSET_X,
  TRAINING_NEW_COURT_PUCK_BLADE_OFFSET_Y,
  TRAINING_NEW_COURT_PUCK_FLIGHT_VISUAL_Y_OFFSET,
  TRAINING_NEW_COURT_VISUAL_Y_OFFSET,
  TRAINING_NEW_COURT_VISUAL_Y_SCALE,
  resolveNewTrainingCourtShot,
} from '../game/trainingNewCourt.js';
import { TelegramLoginButton, type TelegramAuthPayload } from '../auth/TelegramLoginButton.js';
import { useAuthStore, type AuthSession } from '../auth/authStore.js';
import { startVkOAuth } from '../auth/vkAuth.js';
import { detectTimezone } from '../auth/timezone.js';
import { apiFetch, ApiError } from '../api/apiFetch.js';
import { useDailyStore } from '../stores/dailyStore.js';
import {
  DEMO_GOALIE_ID,
  DEMO_PERIOD_NUMBER,
  DEMO_SHOTS_PER_PERIOD,
  DEMO_TOTAL_PERIODS,
  advanceDemoSessionShot,
  createDemoSessionState,
  type DemoSessionState,
} from '../stores/demoSession.js';
import { useTrainingSessionStore } from '../stores/trainingSessionStore.js';
import { useAmateurDuelStore } from '../stores/amateurDuelStore.js';
import { ScoreBoard, type ScoreBoardOpponent } from '../components/ScoreBoard.js';
import { ResultModal } from '../components/ResultModal.js';
import { GlassSelect } from '../components/GlassSelect.js';
import { UserAvatar } from '../chat/components/UserAvatar.js';
import type {
  DailyGameStats,
  DailyStateResponse,
  PeriodLogEntry,
  ShotInputPayload,
  ShotResultType,
} from '../api/duel.js';
import type { TrainingStateResponse } from '../api/training.js';
import {
  acceptAmateurDuel,
  cancelAmateurDuel,
  challengeAmateurDuel,
  fetchAmateurEvents,
  fetchAmateurMatches,
  fetchAmateurRating,
  fetchAmateurTemplates,
  joinAmateurMatchmaking,
  leaveAmateurMatchmaking,
  searchAmateurOpponents,
  settleAmateurDuel,
  type AmateurDuelKind,
  type AmateurDuelMatch,
  type AmateurDuelMatchState,
  type AmateurDuelPeriodRule,
  type AmateurOpponent,
} from '../api/amateurDuel.js';
import { StartPeriodModal } from '../components/StartPeriodModal.js';
import { getLastSeenAt, setLastSeenAt } from '../stores/seenPeriods.js';

const PAUSE_MS = 1000;
const HUB_PERIOD_DURATION_MS = 20 * 60 * 1000;
const MODE_ARTWORK_SIZE = 104;
const DAILY_HUB_ARTWORK_SIZE = 104;

type GameLevel = 'beginner' | 'amateur' | 'pro';
type BeginnerMode = 'daily' | 'training';
type DailyView = 'hub' | 'play';
type AmateurView = 'home' | 'duels' | 'tournaments';
type AmateurDuelTab = 'game' | 'locker' | 'rating' | 'history';
type LevelArtwork = 'beginner' | 'amateur' | 'pro';
type DailyHubArtwork = 'period-1' | 'period-2' | 'period-3' | 'break' | 'finished' | 'start';
type ModeInfoModalContent = { title: string; text: string };
type TrainingCourtDesign = 'standard' | 'new';
export type PlayShotResolver = (context: {
  input: ShotInput;
  goalieConfig: GoalieConfig;
  seed: string;
  shotIndex: number;
  stickEffects: StickEffects;
  phaseOffsets: SessionPhaseOffsets;
  shooterX: number;
}) => ShotResult;

const MODE_ARTWORK_IMAGES: Record<LevelArtwork, string | null> = {
  beginner: '/modes/beginner.webp',
  amateur: '/modes/amateur.webp',
  pro: '/modes/pro.webp',
};
const DUEL_EVENT_ARTWORK_IMAGE = '/modes/amateur-duel-card.webp';
const DUEL_KIND_ARTWORK_IMAGES: Record<AmateurDuelKind, string> = {
  express: '/modes/amateur-duel-steal-clean.webp',
  express_plus: '/modes/amateur-duel-card.webp',
  classic: '/modes/amateur-duel.webp',
};

const DAILY_HUB_ARTWORK_IMAGES: Record<DailyHubArtwork, string> = {
  'period-1': '/daily-game/period-1.webp',
  'period-2': '/daily-game/period-2.webp',
  'period-3': '/daily-game/period-3.webp',
  break: '/daily-game/break.webp',
  finished: '/daily-game/finished.webp',
  start: '/daily-game/start.webp',
};
const TRAINING_COURT_DESIGN_STORAGE_KEY = 'hockey.trainingCourtDesign';
const TRAINING_HITBOX_TOGGLE_STORAGE_KEY = 'hockey.trainingHitboxesVisible';

function readTrainingCourtDesign(): TrainingCourtDesign {
  if (typeof window === 'undefined') return 'standard';
  try {
    return window.localStorage.getItem(TRAINING_COURT_DESIGN_STORAGE_KEY) === 'new'
      ? 'new'
      : 'standard';
  } catch {
    return 'standard';
  }
}

function saveTrainingCourtDesign(value: TrainingCourtDesign): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TRAINING_COURT_DESIGN_STORAGE_KEY, value);
  } catch {
    // The toggle is a local admin aid; storage failure should not block gameplay.
  }
}

function readTrainingHitboxesVisible(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(TRAINING_HITBOX_TOGGLE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function saveTrainingHitboxesVisible(value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TRAINING_HITBOX_TOGGLE_STORAGE_KEY, String(value));
  } catch {
    // The toggle is a local admin aid; storage failure should not block gameplay.
  }
}

function dailyHubArtworkFor(
  data: DailyStateResponse,
  isDailyLockedByTraining: boolean,
): DailyHubArtwork {
  if (isDailyLockedByTraining || data.state === 'break_active') return 'break';
  if (data.state === 'closed') return 'finished';
  if (data.state === 'period_active') {
    const period = Math.min(3, Math.max(1, data.current_period));
    return `period-${period}` as DailyHubArtwork;
  }
  if (data.current_period === 0) return 'start';
  const nextPeriod = Math.min(3, Math.max(1, data.current_period + 1));
  return `period-${nextPeriod}` as DailyHubArtwork;
}

function periodSpeedPresetFor(
  periodNumber: number,
  presets?: readonly DailyPeriodSpeedPreset[],
): DailyPeriodSpeedPreset {
  const exact = presets?.find((preset) => preset.periodNumber === periodNumber);
  if (exact) return exact;
  const normalized = Math.min(3, Math.max(1, Math.trunc(periodNumber))) as 1 | 2 | 3;
  return (
    presets?.find((preset) => preset.periodNumber === normalized) ??
    getDailyPeriodSpeedPreset(normalized)
  );
}

function speedOverridesForPeriod(
  periodNumber: number,
  presets?: readonly DailyPeriodSpeedPreset[],
): SpeedOverrides {
  const preset = periodSpeedPresetFor(periodNumber, presets);
  return {
    goalFreq: preset.goalFrequency,
    goalieFreq: preset.goalieFrequency,
    shooterFreq: preset.shooterFrequency,
    puckSpeed: preset.puckSpeedPerMs,
  };
}

function computeShooterX(t: number, freq: number): number {
  const period = 1000 / freq;
  const phase = (((t % period) + period) % period) / period;
  const tri = phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4;
  return SHOOTER_CENTER_X + SHOOTER_AMPLITUDE * tri;
}

function startIceCarLoop(
  iceCarRef: { current: IceCar | null },
  iceCarRafRef: { current: number | null },
  mountedRef: { current: boolean },
  scaleRef: { current: Scale },
): void {
  if (iceCarRafRef.current !== null) return;
  const iceCar = iceCarRef.current;
  if (!iceCar) return;

  iceCar.container.visible = true;
  let t0 = -1;
  const carStep = (rafTime: number): void => {
    if (!mountedRef.current) return;
    if (t0 < 0) t0 = rafTime;
    const pos = iceCarPosAt(rafTime - t0);
    iceCar.update(scaleRef.current, pos.x, pos.y, pos.rot);
    iceCarRafRef.current = requestAnimationFrame(carStep);
  };
  iceCarRafRef.current = requestAnimationFrame(carStep);
}

function stopIceCarLoop(
  iceCarRef: { current: IceCar | null },
  iceCarRafRef: { current: number | null },
): void {
  if (iceCarRafRef.current !== null) {
    cancelAnimationFrame(iceCarRafRef.current);
    iceCarRafRef.current = null;
  }
  if (iceCarRef.current) iceCarRef.current.container.visible = false;
}

function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function formatHms(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatEventRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  if (days > 99) return `${days} дн`;
  if (days > 0) {
    const hours = String(Math.floor((total % 86400) / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    return `${days}д ${hours}:${minutes}`;
  }
  return formatHms(ms);
}

function formatSpeedValue(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

function formatGoalRate(goals: number, shots: number): string {
  if (shots <= 0) return '0%';
  return `${Math.round((goals / shots) * 100)}%`;
}

function formatDailyGameDate(dayDate: string): string {
  const [year, month, day] = dayDate.split('-');
  if (!year || !month || !day) return dayDate;
  return `${day}.${month}.${year}`;
}

function formatDurationMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function findUnseenPeriodSummary(data: DailyStateResponse, userId: string): PeriodLogEntry | null {
  if (!userId) return null;
  const watermark = getLastSeenAt(userId);
  for (const period of data.recent_periods) {
    if (watermark === null || period.ended_at > watermark) return period;
  }
  return null;
}

function dailyGameStatsFromState(data: DailyStateResponse): DailyGameStats | null {
  if (data.state === 'closed' && data.previous_game) return data.previous_game;
  if (!data.day_date || data.recent_periods.length === 0) return null;
  const periods = data.recent_periods;
  return {
    day_date: data.day_date,
    total_shots: periods.reduce((sum, period) => sum + period.shots_taken, 0),
    total_goals: periods.reduce((sum, period) => sum + period.goals, 0),
    total_duration_ms: periods.reduce((sum, period) => sum + period.duration_ms, 0),
    periods,
  };
}

function latestPeriodFromStats(stats: DailyGameStats | null): PeriodLogEntry | null {
  return stats?.periods.at(-1) ?? null;
}

export function DailyScreen(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const data = useDailyStore((s) => s.data);
  const error = useDailyStore((s) => s.error);
  const loading = useDailyStore((s) => s.loading);
  const refresh = useDailyStore((s) => s.refresh);
  const [selectedLevel, setSelectedLevel] = useState<GameLevel>('beginner');
  const [activeAmateurMatchId, setActiveAmateurMatchId] = useState<string | null>(null);
  const [amateurView, setAmateurView] = useState<AmateurView>('home');
  const [beginnerMode, setBeginnerMode] = useState<BeginnerMode>(() => {
    const view = new URLSearchParams(location.search).get('view');
    return view === 'training' ? 'training' : 'daily';
  });
  const [dailyView, setDailyView] = useState<DailyView>(() => {
    const view = new URLSearchParams(location.search).get('view');
    return view === 'daily' ? 'play' : 'hub';
  });

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const view = params.get('view');
    if (view === 'hub') {
      setDailyView('hub');
      setSelectedLevel('beginner');
      setBeginnerMode('daily');
    }
    if (view === 'daily') {
      setDailyView('play');
      setSelectedLevel('beginner');
      setBeginnerMode('daily');
    }
    if (view === 'training') {
      setDailyView('hub');
      setSelectedLevel('beginner');
      setBeginnerMode('training');
    }
    if (view === 'amateur') {
      const matchId = params.get('match');
      const section = params.get('section');
      setDailyView('hub');
      setSelectedLevel('amateur');
      setBeginnerMode('daily');
      if (matchId) {
        setAmateurView('duels');
        setActiveAmateurMatchId(matchId);
      } else {
        setActiveAmateurMatchId(null);
        setAmateurView(section === 'duels' || section === 'tournaments' ? section : 'home');
      }
    }
  }, [location.search]);

  if (!data) {
    return (
      <main
        className="screen"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 12,
          padding: 20,
          textAlign: 'center',
        }}
      >
        {error ? (
          <>
            <div style={{ color: 'var(--red-deep, #b91c1c)', fontWeight: 600 }}>
              Не удалось загрузить
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 13, maxWidth: 280 }}>{error}</div>
            <button
              type="button"
              className="btn btn--cta"
              onClick={() => void refresh()}
              disabled={loading}
            >
              Повторить
            </button>
            <div style={{ color: 'var(--muted)', fontSize: 11 }}>
              Если ошибка повторяется — выйди и зайди заново через /login.
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--muted)' }}>Загрузка…</div>
        )}
      </main>
    );
  }

  const openHub = (): void => {
    setDailyView('hub');
    setSelectedLevel('beginner');
    setBeginnerMode('daily');
    navigate('/?view=hub', { replace: true });
  };

  const openDailyPlay = (): void => {
    setDailyView('play');
    setSelectedLevel('beginner');
    setBeginnerMode('daily');
    navigate('/?view=daily', { replace: true });
  };

  const openTraining = (): void => {
    setDailyView('hub');
    setSelectedLevel('beginner');
    setBeginnerMode('training');
    navigate('/?view=training', { replace: true });
  };

  if (selectedLevel === 'beginner' && beginnerMode === 'daily' && dailyView === 'play') {
    return <DailyPlayView onBack={openHub} />;
  }

  if (selectedLevel !== 'beginner') {
    if (selectedLevel === 'amateur') {
      if (activeAmateurMatchId) {
        return (
          <AmateurDuelPlayView
            matchId={activeAmateurMatchId}
            onBack={() => {
              setActiveAmateurMatchId(null);
              setAmateurView('duels');
              navigate('/?view=amateur&section=duels', { replace: true });
            }}
          />
        );
      }
      if (amateurView === 'duels') {
        return (
          <AmateurDuelsPage
            onBack={() => {
              setAmateurView('home');
              navigate('/?view=amateur', { replace: true });
            }}
            onOpenMatch={(matchId) => {
              setActiveAmateurMatchId(matchId);
              navigate(`/?view=amateur&match=${encodeURIComponent(matchId)}`, {
                replace: true,
              });
            }}
          />
        );
      }
      if (amateurView === 'tournaments') {
        return (
          <AmateurTournamentsPage
            onBack={() => {
              setAmateurView('home');
              navigate('/?view=amateur', { replace: true });
            }}
          />
        );
      }
      return (
        <AmateurHub
          onBack={() => {
            setSelectedLevel('beginner');
            setBeginnerMode('daily');
            setAmateurView('home');
            navigate('/?view=hub', { replace: true });
          }}
          onOpenDuels={() => {
            setAmateurView('duels');
            navigate('/?view=amateur&section=duels', { replace: true });
          }}
          onOpenTournaments={() => {
            setAmateurView('tournaments');
            navigate('/?view=amateur&section=tournaments', { replace: true });
          }}
        />
      );
    }
    return (
      <LevelPlaceholder
        level={selectedLevel}
        onBack={() => {
          setSelectedLevel('beginner');
          setBeginnerMode('daily');
        }}
      />
    );
  }

  if (beginnerMode === 'training') {
    return <TrainingPlaceholder onBack={openHub} />;
  }

  return (
    <GameHub
      onOpenDailyPlay={openDailyPlay}
      onOpenTraining={openTraining}
      onOpenAmateurs={() => {
        setSelectedLevel('amateur');
        setAmateurView('home');
        navigate('/?view=amateur', { replace: true });
      }}
      onOpenAmateurMatch={(matchId) => {
        setSelectedLevel('amateur');
        setBeginnerMode('daily');
        setDailyView('hub');
        setAmateurView('duels');
        setActiveAmateurMatchId(matchId);
        navigate(`/?view=amateur&match=${encodeURIComponent(matchId)}`, { replace: true });
      }}
    />
  );
}

function SegmentedControl({
  ariaLabel,
  items,
  value,
  disabled = false,
  onChange,
}: {
  ariaLabel: string;
  items: readonly { id: string; label: string }[];
  value: string;
  disabled?: boolean;
  onChange: (id: string) => void;
}): JSX.Element {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        gap: 4,
        padding: 4,
        borderRadius: 999,
        background: 'rgba(15, 23, 42, 0.08)',
      }}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(item.id)}
            style={{
              minWidth: 0,
              minHeight: 34,
              borderRadius: 999,
              border: active ? '1px solid rgba(15, 23, 42, 0.92)' : '1px solid transparent',
              background: active ? 'rgba(15, 23, 42, 0.92)' : 'transparent',
              color: active ? '#ffffff' : 'var(--ink)',
              fontSize: 12,
              fontWeight: 800,
              cursor: disabled ? 'default' : 'pointer',
              padding: '0 8px',
              opacity: disabled && !active ? 0.52 : 1,
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function GameHub({
  onOpenDailyPlay,
  onOpenTraining,
  onOpenAmateurs,
  onOpenAmateurMatch,
}: {
  onOpenDailyPlay: () => void;
  onOpenTraining: () => void;
  onOpenAmateurs: () => void;
  onOpenAmateurMatch: (matchId: string) => void;
}): JSX.Element {
  const data = useDailyStore((s) => s.data)!;
  const refresh = useDailyStore((s) => s.refresh);
  const trainingData = useTrainingSessionStore((s) => s.data);
  const [modeInfoModal, setModeInfoModal] = useState<ModeInfoModalContent | null>(null);
  const [dailyStatsOpen, setDailyStatsOpen] = useState(false);
  const [duelStatsMatch, setDuelStatsMatch] = useState<AmateurDuelMatch | null>(null);
  const pending = useDailyStore((s) => s.inFlight);
  const nextPeriod = data.current_period === 0 ? 1 : data.current_period + 1;
  const dailyAvailableTitle = `${nextPeriod}-й период доступен`;
  const breakEndsAt = data.break_ends_at ? new Date(data.break_ends_at).getTime() : 0;
  const periodEndsAt = data.period_ends_at ? new Date(data.period_ends_at).getTime() : 0;
  const nextDayAt = new Date(data.next_day_starts_at).getTime();
  const trainingCooldownEndsAt = data.training_cooldown_ends_at
    ? new Date(data.training_cooldown_ends_at).getTime()
    : 0;
  const [now, setNow] = useState(Date.now());
  const breakRemaining = Math.max(0, breakEndsAt - now);
  const periodRemaining = Math.max(0, periodEndsAt - now);
  const nextDayRemaining = Math.max(0, nextDayAt - now);
  const trainingCooldownRemaining = Math.max(0, trainingCooldownEndsAt - now);
  const isDailyStartedAndIncomplete =
    data.state === 'period_active' ||
    data.state === 'break_active' ||
    (data.state === 'idle' && data.current_period > 0 && data.current_period < data.total_periods);
  const isTrainingLockedByDaily = isDailyStartedAndIncomplete;
  const isDailyLockedByTraining =
    data.state === 'idle' &&
    data.current_period === 0 &&
    trainingCooldownEndsAt > 0 &&
    trainingCooldownRemaining > 0;
  const dailyHubArtwork = dailyHubArtworkFor(data, isDailyLockedByTraining);
  const amateurEvents = useQuery({
    queryKey: ['amateur-duel', 'events'],
    queryFn: fetchAmateurEvents,
    enabled: data.lifetime_total_goals >= 1000,
    refetchInterval: 30_000,
  });
  const amateurEventItems = amateurEvents.data?.events ?? [];
  const hasTimedAmateurEvents = amateurEventItems.some(
    (event) => event.status !== 'settled' && event.status !== 'expired',
  );
  const duelStatsCurrentMatch = duelStatsMatch
    ? (amateurEventItems.find((event) => event.id === duelStatsMatch.id) ?? duelStatsMatch)
    : null;
  const eventCardsCount = 1 + amateurEventItems.length;
  const canSwipeEvents = eventCardsCount > 1;
  const eventCardWidth = canSwipeEvents ? 'calc(100% - 30px)' : '100%';
  const eventCarouselRef = useRef<HTMLDivElement | null>(null);
  const [activeEventIndex, setActiveEventIndex] = useState(0);

  const eventScrollStep = useCallback((): number => {
    const carousel = eventCarouselRef.current;
    const firstCard = carousel?.firstElementChild as HTMLElement | null;
    return (firstCard?.offsetWidth ?? carousel?.clientWidth ?? 0) + 10;
  }, []);

  const setEventCarouselScroll = useCallback((left: number, behavior: ScrollBehavior): void => {
    const carousel = eventCarouselRef.current;
    if (!carousel) return;
    if (typeof carousel.scrollTo === 'function') {
      carousel.scrollTo({ left, behavior });
      return;
    }
    carousel.scrollLeft = left;
  }, []);

  const handleEventCarouselScroll = useCallback((): void => {
    const carousel = eventCarouselRef.current;
    const step = eventScrollStep();
    if (!carousel || step <= 0) return;
    const index = Math.round(carousel.scrollLeft / step);
    setActiveEventIndex(Math.min(eventCardsCount - 1, Math.max(0, index)));
  }, [eventCardsCount, eventScrollStep]);

  const scrollToEventCard = useCallback(
    (index: number): void => {
      const carousel = eventCarouselRef.current;
      const step = eventScrollStep();
      if (!carousel || step <= 0) return;
      setEventCarouselScroll(step * index, 'smooth');
      setActiveEventIndex(index);
    },
    [eventScrollStep, setEventCarouselScroll],
  );

  useEffect(() => {
    if (
      data.state !== 'period_active' &&
      data.state !== 'break_active' &&
      data.state !== 'closed' &&
      !isDailyLockedByTraining &&
      !hasTimedAmateurEvents
    ) {
      return undefined;
    }
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [data.state, hasTimedAmateurEvents, isDailyLockedByTraining]);

  useEffect(() => {
    if (data.state === 'period_active' && periodEndsAt > 0 && periodRemaining === 0) void refresh();
    if (data.state === 'break_active' && breakEndsAt > 0 && breakRemaining === 0) void refresh();
    if (data.state === 'closed' && nextDayAt > 0 && nextDayRemaining === 0) void refresh();
    if (isDailyLockedByTraining && trainingCooldownEndsAt > 0 && trainingCooldownRemaining === 0) {
      void refresh();
    }
  }, [
    data.state,
    periodEndsAt,
    periodRemaining,
    breakEndsAt,
    breakRemaining,
    nextDayAt,
    nextDayRemaining,
    isDailyLockedByTraining,
    trainingCooldownEndsAt,
    trainingCooldownRemaining,
    refresh,
  ]);

  useEffect(() => {
    if (!canSwipeEvents) {
      setActiveEventIndex(0);
      setEventCarouselScroll(0, 'auto');
      return;
    }
    setActiveEventIndex((index) => Math.min(index, eventCardsCount - 1));
  }, [canSwipeEvents, eventCardsCount, setEventCarouselScroll]);

  const isDailyInProgress = data.state === 'period_active' || data.state === 'break_active';
  const isDailyClosed = data.state === 'closed';
  const dailyActionDisabled = pending || isDailyClosed;
  const dailyActionLabel = isDailyInProgress
    ? 'Вернуться на площадку'
    : isDailyLockedByTraining
      ? `Игра через ${formatHms(trainingCooldownRemaining)}`
      : 'На площадку';
  const dailyEventTitle = isDailyLockedByTraining
    ? 'Восстановление'
    : data.state === 'period_active'
      ? `${data.current_period}-й период`
      : data.state === 'break_active'
        ? 'Перерыв'
        : data.state === 'closed'
          ? 'Завершена'
          : dailyAvailableTitle;
  const dailyHubScoreboard =
    data.state === 'period_active'
      ? {
          timerLabel: 'До конца',
          timer: formatMs(periodRemaining),
          activePeriod: data.current_period,
          ariaLabel: `${data.current_period}-й период. До конца ${formatMs(periodRemaining)}`,
        }
      : data.state === 'break_active'
        ? {
            timerLabel: 'До конца',
            timer: formatMs(breakRemaining),
            activePeriod: nextPeriod,
            ariaLabel: `Перерыв. До конца ${formatMs(breakRemaining)}. Период ${nextPeriod}`,
          }
        : data.state === 'closed'
          ? {
              timerLabel: 'До обновления',
              timer: formatHms(nextDayRemaining),
              activePeriod: null,
              ariaLabel: `Завершена. До обновления ${formatHms(nextDayRemaining)}. Периоды не активны`,
            }
          : isDailyLockedByTraining
            ? {
                timerLabel: 'До игры',
                timer: formatHms(trainingCooldownRemaining),
                activePeriod: null,
                ariaLabel: `Восстановление. До игры ${formatHms(trainingCooldownRemaining)}`,
              }
            : {
                timerLabel: 'Время',
                timer: formatMs(HUB_PERIOD_DURATION_MS),
                activePeriod: nextPeriod,
                ariaLabel: `${dailyAvailableTitle}. Время периода ${formatMs(HUB_PERIOD_DURATION_MS)}. Период ${nextPeriod}`,
              };
  const amateurGoals = Math.min(1000, data.lifetime_total_goals);
  const amateurProgress = Math.round((amateurGoals / 1000) * 100);
  const isAmateurUnlocked = amateurGoals >= 1000;
  const trainingShotsLimit = trainingData?.shots_limit ?? 500;
  const trainingShotsTaken = trainingData?.shots_taken ?? 0;
  const trainingAvailability = isTrainingLockedByDaily
    ? 'Закрыта до завершения игры'
    : `${trainingShotsTaken}/${trainingShotsLimit} бросков сегодня`;

  const handleDailyAction = async (): Promise<void> => {
    if (pending || isDailyClosed) return;
    if (isDailyLockedByTraining) {
      setModeInfoModal({
        title: 'Нужно восстановиться',
        text: `После тренировочного броска ежедневную игру можно начать только через 2 часа. Осталось ${formatHms(trainingCooldownRemaining)}.`,
      });
      return;
    }
    onOpenDailyPlay();
  };

  const handleOpenTraining = (): void => {
    if (isTrainingLockedByDaily) {
      setModeInfoModal({
        title: 'Тренировка закрыта',
        text: 'Пока ежедневная игра начата и не завершён 3-й период, тренировка недоступна. Доиграйте текущий день, затем возвращайтесь к тренировкам.',
      });
      return;
    }
    onOpenTraining();
  };

  const handleOpenAmateurs = (): void => {
    if (!isAmateurUnlocked) {
      setModeInfoModal({
        title: 'Не хватает шайб',
        text: 'Для открытия любительских игр необходимо забить 1000 шайб в ежедневных играх',
      });
      return;
    }
    onOpenAmateurs();
  };

  const handleOpenPro = (): void => {
    setModeInfoModal({
      title: 'Раздел в разработке',
      text: 'Следите за обновлениями игры. Как только режим будет готов, мы вам обязательно сообщим.',
    });
  };

  return (
    <main
      className="screen"
      style={{
        padding: 'calc(16px + var(--app-safe-top)) 14px 24px',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 760,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <section
          aria-label="События"
          style={{
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            className="section-label"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 6,
              margin: '0 0 6px',
            }}
          >
            <span style={{ transform: 'translateX(-14px)' }}>
              События{eventCardsCount > 1 ? ` (${eventCardsCount})` : ''}
            </span>
            <button
              type="button"
              onClick={() =>
                setModeInfoModal({
                  title: 'Здесь будет описание страницы',
                  text: 'Здесь будут собраны все игровые события: ежедневная игра, дуэли, турниры и другие активности.',
                })
              }
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
              }}
              aria-label="Об описании страницы"
            >
              <Info size={12} color="var(--muted)" />
            </button>
          </div>

          <div
            ref={eventCarouselRef}
            aria-label="Карусель событий"
            onScroll={canSwipeEvents ? handleEventCarouselScroll : undefined}
            style={{
              display: 'flex',
              gap: 10,
              overflowX: canSwipeEvents ? 'auto' : 'hidden',
              scrollSnapType: canSwipeEvents ? 'x mandatory' : 'none',
              WebkitOverflowScrolling: 'touch',
              paddingRight: canSwipeEvents ? 18 : 0,
              paddingBottom: 2,
            }}
          >
            <div
              style={{
                position: 'relative',
                overflow: 'hidden',
                borderRadius: 28,
                padding: 18,
                minHeight: 206,
                minWidth: eventCardWidth,
                scrollSnapAlign: 'start',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 18,
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.82) 0%, rgba(226,238,249,0.74) 100%)',
                border: '1px solid rgba(255,255,255,0.82)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.95)',
              }}
            >
              <button
                type="button"
                aria-label="Статистика последней игры"
                title="Статистика последней игры"
                onClick={() => setDailyStatsOpen(true)}
                className="icon-btn"
                style={{
                  position: 'absolute',
                  top: 16,
                  right: 16,
                  zIndex: 2,
                  width: 30,
                  height: 30,
                }}
              >
                <BarChart3 size={15} strokeWidth={2.35} />
              </button>

              <div
                style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14 }}
              >
                <div
                  style={{
                    color: 'rgba(15, 23, 42, 0.58)',
                    fontSize: 10,
                    fontWeight: 900,
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                  }}
                >
                  Ежедневная игра
                </div>

                <div
                  aria-label="Статус ежедневной игры"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `${DAILY_HUB_ARTWORK_SIZE}px minmax(0, 1fr)`,
                    alignItems: 'center',
                    gap: 14,
                  }}
                >
                  <img
                    src={DAILY_HUB_ARTWORK_IMAGES[dailyHubArtwork]}
                    alt=""
                    aria-hidden="true"
                    style={{
                      display: 'block',
                      width: DAILY_HUB_ARTWORK_SIZE,
                      height: DAILY_HUB_ARTWORK_SIZE,
                      borderRadius: 20,
                      border: '1px solid rgba(255,255,255,0.82)',
                      boxSizing: 'border-box',
                      objectFit: 'cover',
                      boxShadow:
                        'inset 0 1px 0 rgba(255,255,255,0.9), 0 16px 28px rgba(15,23,42,0.24)',
                    }}
                  />
                  <div
                    style={{
                      minWidth: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        color: '#10192d',
                        fontSize: 25,
                        lineHeight: 1.05,
                        fontWeight: 900,
                        textAlign: 'left',
                      }}
                    >
                      {dailyEventTitle}
                    </div>
                    <DailyHubScoreboard
                      activePeriod={dailyHubScoreboard.activePeriod}
                      align="left"
                      ariaLabel={dailyHubScoreboard.ariaLabel}
                      periodsTotal={data.total_periods}
                      timer={dailyHubScoreboard.timer}
                      timerLabel={dailyHubScoreboard.timerLabel}
                    />
                  </div>
                </div>
              </div>

              <div
                style={{
                  position: 'relative',
                }}
              >
                <button
                  type="button"
                  className="btn btn--cta"
                  disabled={dailyActionDisabled}
                  onClick={() => void handleDailyAction()}
                  style={{
                    width: '100%',
                    minHeight: 62,
                    padding: '0 18px',
                    justifyContent: 'center',
                    letterSpacing: 0,
                    fontSize: 17,
                    boxShadow: dailyActionDisabled
                      ? 'none'
                      : '0 20px 34px rgba(15,23,42,0.28), inset 0 1px 0 rgba(255,255,255,0.12)',
                  }}
                >
                  {dailyActionLabel}
                </button>
              </div>
            </div>
            {amateurEventItems.map((event) => (
              <DuelEventCard
                key={event.id}
                cardWidth={eventCardWidth}
                match={event}
                now={now}
                onOpen={() => onOpenAmateurMatch(event.id)}
                onOpenStats={() => setDuelStatsMatch(event)}
              />
            ))}
          </div>
          {canSwipeEvents && (
            <div
              aria-label="Страницы событий"
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 6,
                marginTop: 8,
                minHeight: 10,
              }}
            >
              {Array.from({ length: eventCardsCount }, (_, index) => {
                const active = index === activeEventIndex;
                return (
                  <button
                    key={index}
                    type="button"
                    aria-label={`Событие ${index + 1}`}
                    onClick={() => scrollToEventCard(index)}
                    style={{
                      width: active ? 18 : 7,
                      height: 7,
                      borderRadius: 999,
                      border: 'none',
                      padding: 0,
                      background: active ? 'rgba(15, 23, 42, 0.72)' : 'rgba(15, 23, 42, 0.2)',
                      cursor: 'pointer',
                      transition: 'width 160ms ease, background 160ms ease',
                    }}
                  />
                );
              })}
            </div>
          )}
        </section>

        <section
          aria-label="Разделы игры"
          style={{
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div className="section-label section-label--page">Режимы</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <LevelHubCard
              title="Тренировка"
              description="Три периода на выбор"
              meta={trainingAvailability}
              artwork="beginner"
              tone={isTrainingLockedByDaily ? 'muted' : 'active'}
              onClick={handleOpenTraining}
            />

            <LevelHubCard
              title="Любители"
              description="Дуэли, турниры, инвентарь"
              meta={`${amateurGoals}/1000 шайб для открытия`}
              artwork="amateur"
              tone={isAmateurUnlocked ? 'default' : 'muted'}
              progress={amateurProgress}
              onClick={handleOpenAmateurs}
            />

            <LevelHubCard
              title="Профессионалы"
              description="Игры самого высокого уровня"
              meta="Раздел в разработке"
              artwork="pro"
              tone="muted"
              onClick={handleOpenPro}
            />
          </div>
        </section>
      </div>

      {modeInfoModal && (
        <ModeInfoModal
          title={modeInfoModal.title}
          text={modeInfoModal.text}
          onClose={() => setModeInfoModal(null)}
        />
      )}

      {dailyStatsOpen && (
        <DailyGameStatsModal
          stats={data.previous_game}
          totalPeriods={data.total_periods}
          onClose={() => setDailyStatsOpen(false)}
        />
      )}
      {duelStatsCurrentMatch && (
        <DuelStatsModal match={duelStatsCurrentMatch} onClose={() => setDuelStatsMatch(null)} />
      )}
    </main>
  );
}

function DailyHubScoreboard({
  activePeriod,
  align = 'center',
  ariaLabel,
  periodsTotal,
  timer,
  timerLabel,
}: {
  activePeriod: number | null;
  align?: 'center' | 'left';
  ariaLabel: string;
  periodsTotal: number;
  timer: string;
  timerLabel: string;
}): JSX.Element {
  return (
    <div
      aria-label={ariaLabel}
      style={{
        width: align === 'left' ? 'auto' : '100%',
        maxWidth: align === 'left' ? 'none' : 280,
        padding: '2px 0 0',
        display: 'grid',
        gridTemplateColumns: align === 'left' ? 'max-content max-content' : '1fr 1fr',
        alignItems: 'center',
        justifyItems: align === 'left' ? 'start' : 'center',
        gap: align === 'left' ? 36 : 12,
      }}
    >
      <DailyEventScoreboardColumn align={align} label={timerLabel} value={timer} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: align === 'left' ? 'flex-start' : 'center',
          gap: 5,
          minWidth: 0,
          lineHeight: 1,
        }}
      >
        <DailyEventScoreboardLabel>Период</DailyEventScoreboardLabel>
        <DailyPeriodTabs activePeriod={activePeriod} align={align} periodsTotal={periodsTotal} />
      </div>
    </div>
  );
}

interface DuelEventTiming {
  activePeriod: number | null;
  ariaLabel: string;
  label: string;
  value: string;
}

function timestampMs(iso: string | null): number {
  if (!iso) return 0;
  const value = new Date(iso).getTime();
  return Number.isFinite(value) ? value : 0;
}

function duelMatchNowMs(match: AmateurDuelMatch, fallbackNow: number): number {
  const serverNow = timestampMs(match.server_now);
  const receivedAt = match.received_at_performance_ms;
  if (serverNow > 0 && typeof receivedAt === 'number' && typeof performance !== 'undefined') {
    return serverNow + Math.max(0, performance.now() - receivedAt);
  }
  return fallbackNow;
}

function duelNextPeriod(match: AmateurDuelMatch): number {
  if (match.me.state === 'period_active') return match.me.current_period;
  return Math.min(match.rules.totalPeriods, Math.max(1, match.me.current_period + 1));
}

function duelEventTiming(match: AmateurDuelMatch, fallbackNow: number): DuelEventTiming {
  const now = duelMatchNowMs(match, fallbackNow);
  const startsAt = timestampMs(match.starts_at);
  const endsAt = timestampMs(match.ends_at);
  const periodEndsAt = timestampMs(match.period_ends_at);
  const breakEndsAt = timestampMs(match.break_ends_at);
  const score = `${match.me.goals}:${match.opponent.goals}`;

  if (match.status === 'settled' || match.status === 'expired' || match.status === 'cancelled') {
    return {
      activePeriod: null,
      ariaLabel: `${duelOutcomeText(match)}. Счёт ${score}`,
      label: 'Счёт',
      value: score,
    };
  }

  if (startsAt > now) {
    const value = formatEventRemaining(startsAt - now);
    return {
      activePeriod: 1,
      ariaLabel: `До старта ${value}. Счёт ${score}`,
      label: 'До старта',
      value,
    };
  }

  if (
    match.status === 'ready_check' ||
    match.me.state === 'accepted' ||
    match.me.state === 'invited' ||
    match.me.state === 'loadout_pending' ||
    match.me.state === 'ready'
  ) {
    const readyEndsAt = timestampMs(match.ready_expires_at);
    if (match.status === 'ready_check' && readyEndsAt > now) {
      const value = formatMs(readyEndsAt - now);
      return {
        activePeriod: duelNextPeriod(match),
        ariaLabel: `Комната готовности. До закрытия ${value}. Счёт ${score}`,
        label: 'Готовность',
        value,
      };
    }
    return {
      activePeriod: duelNextPeriod(match),
      ariaLabel: `До старта 00:00. Счёт ${score}`,
      label: 'До старта',
      value: '00:00',
    };
  }

  if (match.me.state === 'period_active' && periodEndsAt > 0) {
    const value = formatMs(periodEndsAt - now);
    return {
      activePeriod: match.me.current_period,
      ariaLabel: `${match.me.current_period}-й период. До конца ${value}. Счёт ${score}`,
      label: 'До конца',
      value,
    };
  }

  if (match.me.state === 'break_active' && breakEndsAt > 0) {
    const value = formatMs(breakEndsAt - now);
    return {
      activePeriod: duelNextPeriod(match),
      ariaLabel: `Перерыв. До конца ${value}. Счёт ${score}`,
      label: 'Перерыв',
      value,
    };
  }

  if ((match.me.state === 'completed' || match.me.state === 'forfeit') && endsAt > now) {
    const value = formatEventRemaining(endsAt - now);
    return {
      activePeriod: match.rules.totalPeriods,
      ariaLabel: `До итога ${value}. Счёт ${score}`,
      label: 'До итога',
      value,
    };
  }

  return {
    activePeriod: duelNextPeriod(match),
    ariaLabel: `Счёт ${score}`,
    label: 'Счёт',
    value: score,
  };
}

function DuelEventCard({
  cardWidth,
  match,
  now,
  onOpen,
  onOpenStats,
}: {
  cardWidth: string;
  match: AmateurDuelMatch;
  now: number;
  onOpen: () => void;
  onOpenStats: () => void;
}): JSX.Element {
  const status = duelOutcomeText(match);
  const timing = duelEventTiming(match, now);
  const actionLabel =
    match.status === 'invited' && match.me.state === 'invited'
      ? 'Ответить на вызов'
      : match.status === 'invited'
        ? 'Открыть вызов'
        : match.status === 'ready_check'
          ? 'Открыть комнату'
          : match.status === 'settled'
            ? 'Открыть итог'
            : 'Открыть дуэль';

  return (
    <article
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 28,
        padding: 18,
        minHeight: 206,
        minWidth: cardWidth,
        scrollSnapAlign: 'start',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 18,
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.82) 0%, rgba(226,238,249,0.74) 100%)',
        border: '1px solid rgba(255,255,255,0.82)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.95)',
      }}
    >
      <button
        type="button"
        aria-label={`Статистика дуэли против ${match.opponent.display_name}`}
        title="Статистика дуэли"
        onClick={onOpenStats}
        className="icon-btn"
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 2,
          width: 30,
          height: 30,
        }}
      >
        <BarChart3 size={15} strokeWidth={2.35} />
      </button>

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div
          style={{
            color: 'rgba(15, 23, 42, 0.58)',
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
          }}
        >
          Любительская дуэль
        </div>

        <div
          aria-label={`Статус дуэли против ${match.opponent.display_name}`}
          style={{
            display: 'grid',
            gridTemplateColumns: `${DAILY_HUB_ARTWORK_SIZE}px minmax(0, 1fr)`,
            alignItems: 'center',
            gap: 14,
          }}
        >
          <img
            src={DUEL_EVENT_ARTWORK_IMAGE}
            alt=""
            aria-hidden="true"
            style={{
              display: 'block',
              width: DAILY_HUB_ARTWORK_SIZE,
              height: DAILY_HUB_ARTWORK_SIZE,
              borderRadius: 20,
              border: '1px solid rgba(255,255,255,0.82)',
              boxSizing: 'border-box',
              objectFit: 'cover',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 16px 28px rgba(15,23,42,0.24)',
            }}
          />
          <div
            style={{
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 8,
            }}
          >
            <div
              style={{
                color: '#10192d',
                fontSize: 25,
                lineHeight: 1.05,
                fontWeight: 900,
                textAlign: 'left',
                overflowWrap: 'anywhere',
              }}
            >
              Дуэль: {match.opponent.display_name}
            </div>
            <DailyHubScoreboard
              activePeriod={timing.activePeriod}
              align="left"
              ariaLabel={`${status}. ${timing.ariaLabel}. Периодов ${match.rules.totalPeriods}`}
              periodsTotal={match.rules.totalPeriods}
              timer={timing.value}
              timerLabel={timing.label}
            />
          </div>
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <button
          type="button"
          className="btn btn--cta"
          onClick={onOpen}
          style={{
            width: '100%',
            minHeight: 62,
            padding: '0 18px',
            justifyContent: 'center',
            letterSpacing: 0,
            fontSize: 17,
            boxShadow: '0 20px 34px rgba(15,23,42,0.28), inset 0 1px 0 rgba(255,255,255,0.12)',
          }}
        >
          {actionLabel}
        </button>
      </div>
    </article>
  );
}

function DailyPeriodTabs({
  activePeriod,
  align = 'center',
  periodsTotal,
}: {
  activePeriod: number | null;
  align?: 'center' | 'left';
  periodsTotal: number;
}): JSX.Element {
  const periodNums = Array.from({ length: periodsTotal }, (_, i) => i + 1);
  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        justifyContent: align === 'left' ? 'flex-start' : 'center',
      }}
    >
      {periodNums.map((n) => (
        <DailyPeriodTab key={n} active={activePeriod !== null && n === activePeriod}>
          {n}
        </DailyPeriodTab>
      ))}
    </div>
  );
}

function DailyPeriodTab({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <span
      style={{
        display: 'inline-flex',
        width: 20,
        height: 20,
        borderRadius: 5,
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        fontWeight: 700,
        background: active ? 'var(--red)' : 'transparent',
        border: active ? 'none' : '1px solid rgba(15, 23, 42, 0.24)',
        color: active ? '#ffffff' : 'rgba(15, 23, 42, 0.34)',
        boxShadow: active ? '0 0 10px rgba(225, 29, 72, 0.55)' : 'none',
      }}
    >
      {children}
    </span>
  );
}

function DailyEventScoreboardColumn({
  align = 'center',
  label,
  value,
}: {
  align?: 'center' | 'left';
  label: string;
  value: string;
}): JSX.Element {
  const color = '#10192d';
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'left' ? 'flex-start' : 'center',
        gap: 5,
        minWidth: 0,
        lineHeight: 1,
      }}
    >
      <DailyEventScoreboardLabel>{label}</DailyEventScoreboardLabel>
      <span
        style={{
          color,
          fontFamily: 'var(--font-mono)',
          fontSize: 20,
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: '0.04em',
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function DailyEventScoreboardLabel({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <span
      style={{
        color: 'rgba(15, 23, 42, 0.52)',
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

function LevelHubCard({
  title,
  description,
  meta,
  artwork,
  tone = 'default',
  progress,
  onClick,
}: {
  title: string;
  description: string;
  meta: string;
  artwork: LevelArtwork;
  tone?: 'active' | 'default' | 'muted';
  progress?: number;
  onClick: () => void;
}): JSX.Element {
  const isLocked = tone === 'muted';
  return (
    <button
      type="button"
      aria-label={title}
      onClick={onClick}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 22,
        padding: 12,
        display: 'grid',
        gridTemplateColumns: `${MODE_ARTWORK_SIZE}px minmax(0, 1fr) 18px`,
        gap: 12,
        alignItems: 'center',
        background: tone === 'active' ? 'rgba(255, 255, 255, 0.64)' : 'rgba(255, 255, 255, 0.48)',
        border: '1px solid rgba(255,255,255,0.66)',
        boxShadow: '0 8px 22px rgba(15,23,42,0.1), inset 0 1px 0 rgba(255,255,255,0.78)',
        width: '100%',
        textAlign: 'left',
        color: 'inherit',
        appearance: 'none',
        WebkitAppearance: 'none',
        cursor: 'pointer',
      }}
    >
      {progress !== undefined && (
        <div
          aria-label={`Прогресс до любителей ${progress}%`}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 3,
            background: 'rgba(15,23,42,0.08)',
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              background: 'linear-gradient(90deg, rgba(34, 158, 217, 0.72), var(--blue-accent))',
            }}
          />
        </div>
      )}
      <ModeArtwork label={title} tone={artwork} muted={isLocked} />
      <div
        style={{
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <h2
          style={{
            margin: 0,
            minWidth: 0,
            fontSize: 18,
            lineHeight: 1.05,
            fontWeight: 900,
            color: 'var(--ink)',
          }}
        >
          {title}
        </h2>
        <div
          style={{
            color: 'rgba(15, 23, 42, 0.64)',
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1.25,
          }}
        >
          {description}
        </div>
        <div
          style={{
            color: 'rgba(15, 23, 42, 0.54)',
            fontSize: 12,
            fontWeight: 800,
            lineHeight: 1.2,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {meta}
        </div>
      </div>
      <ChevronRight
        aria-hidden="true"
        size={19}
        strokeWidth={2.7}
        style={{
          justifySelf: 'end',
          color: 'rgba(15, 23, 42, 0.56)',
        }}
      />
    </button>
  );
}

function ModeInfoModal({
  title,
  text,
  onClose,
}: {
  title: string;
  text: string;
  onClose: () => void;
}): JSX.Element {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.35)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 250,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        className="glass"
        onClick={(e) => e.stopPropagation()}
        style={{ borderRadius: 24, padding: '22px 22px 18px', maxWidth: 320, width: '100%' }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--ink)',
            marginBottom: 10,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{text}</div>
        <button
          type="button"
          className="btn btn--cta"
          onClick={onClose}
          style={{ marginTop: 18, width: '100%', padding: '12px 0', fontSize: 14 }}
        >
          Понятно
        </button>
      </div>
    </div>
  );
}

function DailyGameStatsModal({
  stats,
  totalPeriods,
  title = 'Статистика прошлой игры',
  ariaLabel = 'Статистика последней игры',
  closeLabel = 'Понятно',
  onClose,
}: {
  stats: DailyGameStats | null;
  totalPeriods: number;
  title?: string;
  ariaLabel?: string;
  closeLabel?: string;
  onClose: () => void;
}): JSX.Element {
  const periodsByNumber = new Map<number, PeriodLogEntry>(
    stats?.periods.map((period) => [period.period_number, period]) ?? [],
  );
  const periodNumbers = Array.from({ length: totalPeriods }, (_, index) => index + 1);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.35)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 260,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        className="glass"
        onClick={(event) => event.stopPropagation()}
        style={{
          borderRadius: 24,
          padding: '18px 18px 20px',
          maxWidth: 380,
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 900,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--ink)',
              }}
            >
              {title}
            </div>
            <div
              style={{
                marginTop: 5,
                color: 'rgba(15, 23, 42, 0.55)',
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              {stats ? `Дата: ${formatDailyGameDate(stats.day_date)}` : 'Игр пока нет'}
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <X size={16} />
          </button>
        </div>

        {!stats ? (
          <div
            style={{
              color: 'rgba(15, 23, 42, 0.64)',
              fontSize: 13,
              fontWeight: 700,
              lineHeight: 1.55,
            }}
          >
            После завершения первой ежедневной игры здесь появятся общие итоги и статистика по
            периодам.
          </div>
        ) : (
          <>
            <div
              aria-label={`Итого: ${stats.total_goals} голов из ${stats.total_shots} бросков`}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                gap: 8,
                marginBottom: 16,
              }}
            >
              <DailyStatsMetric label="Броски" value={String(stats.total_shots)} />
              <DailyStatsMetric label="Голы" value={String(stats.total_goals)} />
              <DailyStatsMetric label="Время" value={formatDurationMs(stats.total_duration_ms)} />
              <DailyStatsMetric
                label="Процент"
                value={formatGoalRate(stats.total_goals, stats.total_shots)}
              />
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {periodNumbers.map((periodNumber) => {
                const period = periodsByNumber.get(periodNumber);
                return (
                  <DailyStatsPeriodRow
                    key={periodNumber}
                    periodNumber={periodNumber}
                    period={period}
                  />
                );
              })}
            </div>
          </>
        )}

        <button
          type="button"
          className="btn btn--cta"
          onClick={onClose}
          style={{ marginTop: 18, width: '100%', padding: '12px 0', fontSize: 14 }}
        >
          {closeLabel}
        </button>
      </div>
    </div>
  );
}

function DuelStatsModal({
  match,
  onClose,
}: {
  match: AmateurDuelMatch;
  onClose: () => void;
}): JSX.Element {
  const inventoryLabel =
    match.me.loadout.items.length > 0
      ? `${match.me.loadout.items.length} предм. · ${match.me.loadout.powerScore}/${match.me.loadout.powerCap}`
      : 'нет';
  const currentPeriod = Math.max(match.me.current_period, match.opponent.current_period);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Статистика дуэли"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.35)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 260,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        className="glass"
        onClick={(event) => event.stopPropagation()}
        style={{
          borderRadius: 24,
          padding: '18px 18px 20px',
          maxHeight: 'min(82vh, 720px)',
          maxWidth: 420,
          overflowY: 'auto',
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 900,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--ink)',
              }}
            >
              Статистика дуэли
            </div>
            <div
              style={{
                marginTop: 5,
                color: 'rgba(15, 23, 42, 0.55)',
                fontSize: 12,
                fontWeight: 800,
                overflowWrap: 'anywhere',
              }}
            >
              против {match.opponent.display_name} · {duelOutcomeText(match)}
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <X size={16} />
          </button>
        </div>

        <div
          aria-label={`Счёт дуэли ${match.me.goals}:${match.opponent.goals}`}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 8,
            marginBottom: 14,
          }}
        >
          <DailyStatsMetric label="Счёт" value={`${match.me.goals}:${match.opponent.goals}`} />
          <DailyStatsMetric label="Время" value={formatDurationMs(match.me.active_duration_ms)} />
          <DailyStatsMetric label="Период" value={`${currentPeriod}/${match.rules.totalPeriods}`} />
        </div>

        <DuelStatsInfoGrid
          items={[
            {
              label: 'Формат',
              value: `${duelKindText(match.rules.duelKind)} · ${match.rules.totalPeriods}П`,
            },
            {
              label: 'Окно',
              value: `${formatShortDateTime(match.starts_at)} - ${formatShortDateTime(
                match.ends_at,
              )}`,
            },
            { label: 'Расходник', value: inventoryLabel },
            { label: 'Режим', value: match.ranked ? 'Рейтинг' : 'Товарищ.' },
          ]}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          <DuelStatsParticipantRow label="Вы" participant={match.me} />
          <DuelStatsParticipantRow
            label={match.opponent.display_name}
            participant={match.opponent}
          />
        </div>

        <DuelLoadoutSummary match={match} />

        <button
          type="button"
          className="btn btn--cta"
          onClick={onClose}
          style={{ marginTop: 18, width: '100%', padding: '12px 0', fontSize: 14 }}
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}

function DuelStatsInfoGrid({
  items,
}: {
  items: Array<{ label: string; value: string }>;
}): JSX.Element {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 8,
        marginTop: 8,
      }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            minWidth: 0,
            borderRadius: 14,
            padding: '10px 9px',
            background: 'rgba(255, 255, 255, 0.42)',
            border: '1px solid rgba(255, 255, 255, 0.58)',
          }}
        >
          <div
            style={{
              color: 'rgba(15, 23, 42, 0.52)',
              fontSize: 9,
              fontWeight: 900,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            {item.label}
          </div>
          <div
            style={{
              marginTop: 6,
              color: 'var(--ink)',
              fontSize: item.value.length > 14 ? 11 : 13,
              fontWeight: 900,
              lineHeight: 1.15,
              overflowWrap: 'anywhere',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function DuelStatsParticipantRow({
  label,
  participant,
}: {
  label: string;
  participant: AmateurDuelMatch['me'];
}): JSX.Element {
  const items = [
    { label: 'Голы', value: String(participant.goals) },
    { label: 'Броски', value: String(participant.shots_taken) },
    { label: 'Точность', value: `${participant.accuracy}%` },
    { label: 'Время', value: formatDurationMs(participant.active_duration_ms) },
  ];

  return (
    <div
      aria-label={`${label}: ${participant.goals} голов, ${participant.shots_taken} бросков, точность ${participant.accuracy}%`}
      style={{
        borderRadius: 16,
        padding: '11px 12px',
        background: 'rgba(255, 255, 255, 0.42)',
        border: '1px solid rgba(255, 255, 255, 0.58)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            minWidth: 0,
            color: 'var(--ink)',
            fontSize: 13,
            fontWeight: 900,
            overflowWrap: 'anywhere',
          }}
        >
          {label}
        </div>
        <div
          style={{
            color: 'rgba(15, 23, 42, 0.5)',
            fontSize: 10,
            fontWeight: 900,
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          {duelParticipantStateText(participant.state)}
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 7,
        }}
      >
        {items.map((item) => (
          <div key={item.label} style={{ minWidth: 0 }}>
            <div
              style={{
                color: 'rgba(15, 23, 42, 0.46)',
                fontSize: 8,
                fontWeight: 900,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {item.label}
            </div>
            <div
              style={{
                marginTop: 4,
                color: 'var(--ink)',
                fontFamily: 'var(--font-mono)',
                fontSize: item.label === 'Время' ? 13 : 15,
                fontWeight: 800,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1,
                whiteSpace: 'nowrap',
              }}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function duelParticipantStateText(state: AmateurDuelMatch['me']['state']): string {
  if (state === 'invited') return 'вызов';
  if (state === 'accepted') return 'готов';
  if (state === 'period_active') return 'период';
  if (state === 'break_active') return 'перерыв';
  if (state === 'completed') return 'завершил';
  return 'неявка';
}

function DailyStatsMetric({ label, value }: { label: string; value: string }): JSX.Element {
  const isTime = label === 'Время';
  return (
    <div
      style={{
        borderRadius: 16,
        padding: '12px 8px',
        textAlign: 'center',
        background: 'rgba(255, 255, 255, 0.52)',
        border: '1px solid rgba(255, 255, 255, 0.7)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.72)',
      }}
    >
      <div
        style={{
          color: 'rgba(15, 23, 42, 0.52)',
          fontSize: 9,
          fontWeight: 900,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 7,
          color: 'var(--ink)',
          fontFamily: 'var(--font-mono)',
          fontSize: isTime ? 17 : 20,
          fontWeight: 800,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function DailyStatsPeriodRow({
  periodNumber,
  period,
}: {
  periodNumber: number;
  period: PeriodLogEntry | undefined;
}): JSX.Element {
  const shots = period?.shots_taken ?? 0;
  const goals = period?.goals ?? 0;
  return (
    <div
      aria-label={
        period
          ? `${periodNumber}-й период: ${goals} голов из ${shots} бросков за ${formatDurationMs(period.duration_ms)}`
          : `${periodNumber}-й период: не сыгран`
      }
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto auto',
        alignItems: 'center',
        gap: 10,
        borderRadius: 16,
        padding: '10px 12px',
        background: 'rgba(255, 255, 255, 0.42)',
        border: '1px solid rgba(255, 255, 255, 0.58)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            color: 'var(--ink)',
            fontSize: 13,
            fontWeight: 900,
          }}
        >
          {periodNumber}-й период
        </div>
        <div
          style={{
            marginTop: 3,
            color: 'rgba(15, 23, 42, 0.44)',
            fontSize: 10,
            fontWeight: 800,
            lineHeight: 1.15,
          }}
        >
          {period ? formatDurationMs(period.duration_ms) : 'не сыгран'}
        </div>
      </div>
      <div
        style={{
          color: period ? 'rgba(15, 23, 42, 0.78)' : 'rgba(15, 23, 42, 0.32)',
          fontFamily: 'var(--font-mono)',
          fontSize: 14,
          fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        {period ? `${goals}/${shots}` : '—'}
      </div>
      <div
        style={{
          minWidth: 42,
          color: period ? 'rgba(15, 23, 42, 0.58)' : 'rgba(15, 23, 42, 0.32)',
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
          textAlign: 'right',
        }}
      >
        {period ? formatGoalRate(goals, shots) : '—'}
      </div>
    </div>
  );
}

function ModeArtwork({
  label,
  tone,
  muted,
}: {
  label: string;
  tone: LevelArtwork;
  muted: boolean;
}): JSX.Element {
  const imageSrc = MODE_ARTWORK_IMAGES[tone];
  const palette =
    tone === 'beginner'
      ? {
          bg: 'linear-gradient(145deg, #dbeafe 0%, #f8fafc 48%, #bfdbfe 100%)',
          line: 'rgba(220, 38, 38, 0.34)',
        }
      : tone === 'amateur'
        ? {
            bg: 'linear-gradient(145deg, #d1fae5 0%, #fefce8 52%, #bbf7d0 100%)',
            line: 'rgba(217, 119, 6, 0.36)',
          }
        : {
            bg: 'linear-gradient(145deg, #e2e8f0 0%, #f8fafc 52%, #cbd5e1 100%)',
            line: 'rgba(71, 85, 105, 0.32)',
          };

  return (
    <div
      aria-label={`Изображение режима ${label}`}
      style={{
        position: 'relative',
        width: MODE_ARTWORK_SIZE,
        height: MODE_ARTWORK_SIZE,
        aspectRatio: '1 / 1',
        alignSelf: 'center',
        justifySelf: 'center',
        borderRadius: 22,
        overflow: 'hidden',
        background: palette.bg,
        border: '1px solid rgba(255,255,255,0.82)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 8px 18px rgba(15,23,42,0.12)',
        opacity: 1,
      }}
    >
      {imageSrc && (
        <img
          src={imageSrc}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: muted ? 'grayscale(1) saturate(0.1)' : 'none',
            opacity: muted ? 0.58 : 1,
          }}
        />
      )}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(90deg, transparent 0 46%, rgba(255,255,255,0.55) 46% 54%, transparent 54% 100%)',
          opacity: imageSrc ? 0 : 1,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 68,
          height: 68,
          borderRadius: '50%',
          border: `7px solid ${palette.line}`,
          transform: 'translate(-50%, -50%)',
          opacity: imageSrc ? 0 : 1,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          height: 4,
          transform: 'translateY(-50%)',
          background: palette.line,
          opacity: imageSrc ? 0 : 1,
        }}
      />
    </div>
  );
}

function ModeShell({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <main
      className="screen"
      style={{
        padding: 'calc(22px + var(--app-safe-top)) 24px 24px',
        gap: 14,
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 760,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="icon-btn"
            onClick={onBack}
            aria-label="Назад"
            title="Назад"
            style={{
              width: 40,
              height: 40,
              minWidth: 40,
              minHeight: 40,
              borderRadius: 999,
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <ArrowLeft size={16} />
          </button>
          <h1 style={{ margin: 0, minWidth: 0, fontSize: 24, fontWeight: 800 }}>{title}</h1>
        </div>
        {children}
      </section>
    </main>
  );
}

function TrainingPlaceholder({ onBack }: { onBack: () => void }): JSX.Element {
  const data = useTrainingSessionStore((s) => s.data);
  const loading = useTrainingSessionStore((s) => s.loading);
  const error = useTrainingSessionStore((s) => s.error);
  const inFlight = useTrainingSessionStore((s) => s.inFlight);
  const refresh = useTrainingSessionStore((s) => s.refresh);
  const start = useTrainingSessionStore((s) => s.start);
  const [selectedPeriod, setSelectedPeriod] = useState<1 | 2 | 3>(1);
  const [playTraining, setPlayTraining] = useState(false);
  const [now, setNow] = useState(Date.now());
  const refreshedTrainingDayRef = useRef<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (data?.selected_period === 1 || data?.selected_period === 2 || data?.selected_period === 3) {
      setSelectedPeriod(data.selected_period);
    }
  }, [data?.selected_period]);

  useEffect(() => {
    if (data?.state !== 'active') setPlayTraining(false);
  }, [data?.state]);

  const shotsLimit = data?.shots_limit ?? 500;
  const shotsTaken = data?.shots_taken ?? 0;
  const goals = data?.goals ?? 0;
  const accuracy = shotsTaken > 0 ? Math.round((goals / shotsTaken) * 100) : 0;
  const nextDayAt = data ? new Date(data.next_day_starts_at).getTime() : 0;
  const nextDayRemaining = Math.max(0, nextDayAt - now);
  const canConfigureTraining = !data || data.state === 'idle' || data.state === 'active';
  const trainingActionLabel =
    data?.state === 'active' ? 'Продолжить тренировку' : 'Начать тренировку';

  useEffect(() => {
    if (!data) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [data?.next_day_starts_at]);

  useEffect(() => {
    const nextDayIso = data?.next_day_starts_at;
    if (!nextDayIso || nextDayAt <= 0 || nextDayRemaining > 0) return;
    if (now - nextDayAt > 1500) return;
    if (refreshedTrainingDayRef.current === nextDayIso) return;
    refreshedTrainingDayRef.current = nextDayIso;
    void refresh();
  }, [data?.next_day_starts_at, nextDayAt, nextDayRemaining, now, refresh]);

  const handleTrainingAction = async (): Promise<void> => {
    const next = await start(selectedPeriod);
    if (next?.state === 'active') setPlayTraining(true);
  };

  if (data?.state === 'active' && playTraining) {
    return <TrainingPlayView onBack={() => setPlayTraining(false)} />;
  }

  return (
    <ModeShell title="Тренировка" onBack={onBack}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        <TotalCell label="ЛИМИТ" value={`${shotsTaken}/${shotsLimit}`} />
        <TotalCell label="ЧАСТОТА" value="24ч" />
        <TotalCell label="ДО ОБНОВЛЕНИЯ" value={data ? formatHms(nextDayRemaining) : '--:--:--'} />
      </div>
      {loading && !data ? (
        <div style={{ color: 'var(--muted)', fontSize: 14 }}>Загрузка...</div>
      ) : (
        <>
          {error && (
            <div style={{ color: 'var(--red-deep, #b91c1c)', fontSize: 13, fontWeight: 700 }}>
              {error}
            </div>
          )}
          {canConfigureTraining && (
            <>
              <div style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.45 }}>
                Выбери модель периода. Скорости игрока, ворот, шайбы и вратаря будут такими же, как
                в дневной игре выбранного периода.
              </div>
              <SegmentedControl
                ariaLabel="Период тренировки"
                items={[
                  { id: '1', label: '1 период' },
                  { id: '2', label: '2 период' },
                  { id: '3', label: '3 период' },
                ]}
                value={String(selectedPeriod)}
                onChange={(id) => setSelectedPeriod(Number(id) as 1 | 2 | 3)}
              />
              <PeriodSpeedSummary
                periodNumber={selectedPeriod}
                presets={data?.period_speed_presets}
              />
              <button
                type="button"
                className="btn btn--cta"
                disabled={inFlight}
                onClick={() => void handleTrainingAction()}
              >
                {trainingActionLabel}
              </button>
            </>
          )}
          {data?.state === 'closed' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <TotalCell label="ГОЛЫ" value={String(goals)} />
                <TotalCell label="БРОСКИ" value={`${shotsTaken}/${shotsLimit}`} />
                <TotalCell label="ТОЧНОСТЬ" value={`${accuracy}%`} />
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.45 }}>
                Тренировка на сегодня завершена. Новая откроется завтра.
              </div>
            </>
          )}
        </>
      )}
    </ModeShell>
  );
}

function formatShortDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRuCount(value: number, one: string, few: string, many: string): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? one
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? few
        : many;
  return `${value} ${word}`;
}

function duelKindText(kind: AmateurDuelKind): string {
  if (kind === 'express') return 'Экспресс';
  if (kind === 'express_plus') return 'Экспресс+';
  return 'Классика';
}

function duelPeriodDurationText(rule: AmateurDuelPeriodRule): string {
  const minutes = Math.round(rule.durationMs / 60_000);
  if (minutes >= 1 && rule.durationMs % 60_000 === 0) return `${minutes} мин`;
  return formatMs(rule.durationMs);
}

function duelPeriodModeText(rule: AmateurDuelPeriodRule): string {
  if (rule.mode === 'quota') return `${rule.shotsLimit ?? 30} бросков`;
  return 'на скорость';
}

function duelPeriodStartText(rule: AmateurDuelPeriodRule): string {
  if (rule.mode === 'quota') {
    return `${formatMs(rule.durationMs)} и ${rule.shotsLimit ?? 30} бросков.`;
  }
  return `${formatMs(rule.durationMs)} на скорость: забейте как можно больше.`;
}

function currentDuelPeriodRule(match: AmateurDuelMatch): AmateurDuelPeriodRule {
  const periodNumber =
    match.me.state === 'period_active'
      ? match.me.current_period
      : Math.min(match.rules.totalPeriods, match.me.current_period + 1);
  return (
    match.rules.periodRules.find((rule) => rule.periodNumber === periodNumber) ?? {
      periodNumber,
      mode: match.rules.duelVariant === 'time_attack' ? 'time_attack' : 'quota',
      durationMs: match.rules.periodDurationMs,
      shotsLimit: match.rules.duelVariant === 'time_attack' ? null : match.rules.shotsPerPeriod,
    }
  );
}

function duelOutcomeText(match: AmateurDuelMatch): string {
  if (match.outcome === 'draw') return 'Ничья';
  if (match.outcome === 'double_loss') return 'Оба проиграли';
  if (match.winner_user_id === match.me.user_id) return 'Победа';
  if (match.winner_user_id === match.opponent.user_id) return 'Поражение';
  if (match.status === 'invited' && match.me.state === 'invited') return 'Вас вызвали';
  if (match.status === 'invited') return 'Ожидает ответа';
  if (match.status === 'ready_check') {
    return match.me.state === 'ready' ? 'Ждём соперника' : 'Комната';
  }
  if (match.status === 'active') return 'Идёт';
  if (match.status === 'cancelled' && match.settled_reason === 'declined') {
    return match.me.state === 'forfeit' ? 'Вы отказались' : 'Отказ';
  }
  if (match.status === 'cancelled') return 'Отменена';
  return 'Истекла';
}

function duelProgressText(match: AmateurDuelMatch): string {
  if (match.status === 'invited') return 'вызов';
  if (match.status === 'ready_check') return 'комната';
  if (match.status === 'active') {
    const period = Math.max(1, match.me.current_period, match.opponent.current_period);
    return `${period}/${match.rules.totalPeriods}`;
  }
  if (match.status === 'settled') return 'итог';
  if (match.status === 'cancelled') return 'отмена';
  return 'истёк';
}

function DuelStatusBadge({ match }: { match: AmateurDuelMatch }): JSX.Element {
  const status = duelOutcomeText(match);
  const dotColor =
    match.status === 'active'
      ? 'var(--red)'
      : match.status === 'ready_check'
        ? 'var(--blue-accent)'
        : match.status === 'invited'
          ? '#f59e0b'
          : 'rgba(15,23,42,0.38)';

  return (
    <span
      aria-label={`Статус: ${status}`}
      style={{
        minHeight: 30,
        borderRadius: 999,
        padding: '0 10px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        background: 'rgba(255,255,255,0.48)',
        border: '1px solid rgba(255,255,255,0.68)',
        color: 'rgba(15,23,42,0.68)',
        fontSize: 12,
        fontWeight: 900,
        whiteSpace: 'nowrap',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.72)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: dotColor,
          boxShadow: match.status === 'active' ? '0 0 8px rgba(225, 29, 72, 0.45)' : 'none',
        }}
      />
      {status}
    </span>
  );
}

function AmateurHub({
  onBack,
  onOpenDuels,
  onOpenTournaments,
}: {
  onBack: () => void;
  onOpenDuels: () => void;
  onOpenTournaments: () => void;
}): JSX.Element {
  const matches = useQuery({
    queryKey: ['amateur-duel', 'matches'],
    queryFn: fetchAmateurMatches,
  });

  const allMatches = matches.data?.matches ?? [];
  const activeMatches = allMatches.filter(
    (match) =>
      match.status === 'invited' || match.status === 'ready_check' || match.status === 'active',
  );

  return (
    <ModeShell title="Любители" onBack={onBack}>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="section-label section-label--page">Разделы</div>
        <LevelHubCard
          title="Дуэли"
          description="Игры 1 на 1 и отбор к турнирам"
          meta={
            activeMatches.length > 0
              ? formatRuCount(
                  activeMatches.length,
                  'текущая дуэль',
                  'текущие дуэли',
                  'текущих дуэлей',
                )
              : 'Лёгкая, средняя и сложная дуэль'
          }
          artwork="amateur"
          tone="active"
          onClick={onOpenDuels}
        />
        <LevelHubCard
          title="Турниры"
          description="Соревнования лучших и ценные призы"
          meta="Раздел в разработке"
          artwork="pro"
          tone="muted"
          onClick={onOpenTournaments}
        />
      </section>
    </ModeShell>
  );
}

function AmateurTournamentsPage({ onBack }: { onBack: () => void }): JSX.Element {
  return (
    <ModeShell title="Турниры" onBack={onBack}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        <TotalCell label="СТАТУС" value="скоро" />
        <TotalCell label="МЕСТА" value="топ" />
      </div>

      <section
        className="glass"
        style={{ borderRadius: 22, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div className="section-label" style={{ margin: 0 }}>
          Турнирный путь
        </div>
        <div style={{ color: 'var(--ink)', fontSize: 18, fontWeight: 900 }}>
          Лидеры дуэлей попадут в турнир бесплатно
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.45, fontWeight: 700 }}>
          Здесь позже появятся сетки, регламент месяца и список квалифицированных игроков. Сейчас
          рейтинг дуэлей уже готовится под этот сценарий.
        </div>
      </section>

      <button type="button" className="btn btn--cta" disabled>
        Турниры скоро
      </button>
    </ModeShell>
  );
}

const DUEL_KIND_OPTIONS: AmateurDuelKind[] = ['express', 'express_plus', 'classic'];

function DuelKindPreferencePicker({
  selected,
  onChange,
  onInfo,
}: {
  selected: AmateurDuelKind[];
  onChange: (next: AmateurDuelKind[]) => void;
  onInfo: () => void;
}): JSX.Element {
  const selectedSet = new Set(selected);
  const allSelected = DUEL_KIND_OPTIONS.every((kind) => selectedSet.has(kind));
  const toggleKind = (kind: AmateurDuelKind) => {
    const next = selectedSet.has(kind)
      ? selected.filter((cur) => cur !== kind)
      : [...selected, kind];
    onChange(DUEL_KIND_OPTIONS.filter((cur) => next.includes(cur)));
  };

  return (
    <div className="glass" style={{ borderRadius: 18, padding: 12 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 10,
        }}
      >
        <div className="section-label" style={{ margin: 0, fontSize: 10 }}>
          Форматы поиска
        </div>
        <button
          type="button"
          className="section-info-btn"
          onClick={onInfo}
          aria-label="Правила поиска соперника"
        >
          <Info size={16} strokeWidth={2.3} />
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <DuelKindPreferenceButton
          label="Все"
          checked={allSelected}
          active={allSelected}
          onClick={() => onChange(DUEL_KIND_OPTIONS)}
        />
        {DUEL_KIND_OPTIONS.map((kind) => (
          <DuelKindPreferenceButton
            key={kind}
            label={duelKindText(kind)}
            checked={selectedSet.has(kind)}
            active={!allSelected && selectedSet.has(kind)}
            onClick={() => toggleKind(kind)}
          />
        ))}
      </div>
    </div>
  );
}

function DuelKindPreferenceButton({
  label,
  checked,
  active,
  onClick,
}: {
  label: string;
  checked: boolean;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={onClick}
      style={{
        minHeight: 36,
        borderRadius: 999,
        border: active ? '1px solid rgba(15, 23, 42, 0.18)' : '1px solid rgba(255,255,255,0.72)',
        background: active ? 'rgba(255,255,255,0.68)' : 'rgba(255,255,255,0.3)',
        color: 'var(--ink)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 8,
        padding: '0 13px',
        fontSize: 12,
        fontWeight: 900,
        letterSpacing: '0',
        boxShadow: active ? '0 8px 18px rgba(15, 23, 42, 0.08)' : 'none',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: active ? 'rgba(15, 23, 42, 0.78)' : 'rgba(71,85,105,0.2)',
          boxShadow: active ? '0 0 0 4px rgba(15, 23, 42, 0.06)' : 'none',
          flexShrink: 0,
        }}
      />
      {label}
    </button>
  );
}

function AmateurDuelsPage({
  onBack,
  onOpenMatch,
}: {
  onBack: () => void;
  onOpenMatch: (matchId: string) => void;
}): JSX.Element {
  const navigate = useNavigate();
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const queryClient = useQueryClient();
  const [duelTab, setDuelTab] = useState<AmateurDuelTab>('game');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [duelCreationMode, setDuelCreationMode] = useState<'matchmaking' | 'challenge'>(
    'matchmaking',
  );
  const [matchmakingKinds, setMatchmakingKinds] = useState<AmateurDuelKind[]>([
    'express',
    'express_plus',
    'classic',
  ]);
  const [matchmakingRulesOpen, setMatchmakingRulesOpen] = useState(false);
  const [opponentQuery, setOpponentQuery] = useState('');
  const [selectedOpponent, setSelectedOpponent] = useState<AmateurOpponent | null>(null);
  const [matchmakingNow, setMatchmakingNow] = useState(Date.now());

  const templates = useQuery({
    queryKey: ['amateur-duel', 'templates'],
    queryFn: fetchAmateurTemplates,
  });
  const matches = useQuery({
    queryKey: ['amateur-duel', 'matches'],
    queryFn: fetchAmateurMatches,
  });
  const opponents = useQuery({
    queryKey: ['amateur-duel', 'opponents', opponentQuery],
    queryFn: () => searchAmateurOpponents(opponentQuery, 12),
  });
  const rating = useQuery({
    queryKey: ['amateur-duel', 'rating'],
    queryFn: fetchAmateurRating,
  });

  const acceptMut = useMutation({
    mutationFn: (matchId: string) => acceptAmateurDuel(matchId),
    onSuccess: ({ match }) => {
      void queryClient.invalidateQueries({ queryKey: ['amateur-duel'] });
      onOpenMatch(match.id);
    },
  });
  const settleMut = useMutation({
    mutationFn: (matchId: string) => settleAmateurDuel(matchId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['amateur-duel'] }),
  });
  const cancelMut = useMutation({
    mutationFn: (matchId: string) => cancelAmateurDuel(matchId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['amateur-duel'] }),
  });
  const matchmakingMut = useMutation({
    mutationFn: (duelKinds: AmateurDuelKind[]) => joinAmateurMatchmaking(duelKinds),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['amateur-duel'] });
      if (res.match) onOpenMatch(res.match.id);
    },
  });
  const leaveMatchmakingMut = useMutation({
    mutationFn: () => leaveAmateurMatchmaking(),
    onSuccess: () => {
      matchmakingMut.reset();
      void queryClient.invalidateQueries({ queryKey: ['amateur-duel'] });
    },
  });
  const challengeMut = useMutation({
    mutationFn: (body: { template_id: string; opponent_user_id: string }) =>
      challengeAmateurDuel(body),
    onSuccess: () => {
      setSelectedOpponent(null);
      void queryClient.invalidateQueries({ queryKey: ['amateur-duel'] });
    },
  });

  const templateItems = templates.data?.templates ?? [];
  const activeMatches = (matches.data?.matches ?? []).filter(
    (match) =>
      match.status === 'invited' || match.status === 'ready_check' || match.status === 'active',
  );
  const history = (matches.data?.matches ?? []).filter(
    (match) =>
      match.status === 'settled' || match.status === 'expired' || match.status === 'cancelled',
  );
  const selectedTemplate = selectedTemplateId
    ? (templateItems.find((item) => item.id === selectedTemplateId) ?? null)
    : (templateItems[0] ?? null);
  const opponentOptions = opponentQuery.trim().length > 0 ? (opponents.data?.users ?? []) : [];
  const myRating = rating.data?.rating.find((row) => row.user_id === currentUserId) ?? null;
  const matchmakingTicket = matchmakingMut.data?.ticket ?? null;
  const matchmakingRemaining = matchmakingTicket
    ? new Date(matchmakingTicket.expires_at).getTime() - matchmakingNow
    : 0;
  const isMatchmakingActive = matchmakingTicket !== null && matchmakingRemaining > 0;
  const isMatchmakingExpired =
    matchmakingTicket !== null && matchmakingRemaining <= 0 && !matchmakingMut.isPending;
  const canStartMatchmaking = matchmakingKinds.length > 0 && !matchmakingMut.isPending && !isMatchmakingActive;

  useEffect(() => {
    if (!selectedTemplateId && templateItems[0]) setSelectedTemplateId(templateItems[0].id);
  }, [selectedTemplateId, templateItems]);

  useEffect(() => {
    if (!matchmakingTicket) return undefined;
    const id = window.setInterval(() => setMatchmakingNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [matchmakingTicket]);

  const canChallenge =
    selectedTemplate !== null && selectedOpponent !== null && !challengeMut.isPending;

  return (
    <ModeShell title="Дуэли" onBack={onBack}>
      <SegmentedControl
        ariaLabel="Разделы дуэлей"
        value={duelTab}
        items={[
          { id: 'game', label: 'Игра' },
          { id: 'locker', label: 'Раздевалка' },
          { id: 'rating', label: 'Рейтинг' },
          { id: 'history', label: 'История' },
        ]}
        onChange={(id) => setDuelTab(id as AmateurDuelTab)}
      />

      {duelTab === 'game' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <TotalCell label="ДУЭЛИ" value={String(matches.data?.matches.length ?? 0)} />
            <TotalCell label="ТЕКУЩИЕ" value={String(activeMatches.length)} />
            <TotalCell label="ОЧКИ" value={String(myRating?.points ?? 0)} />
          </div>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="section-label section-label--page">Новая дуэль</div>
            {duelCreationMode === 'challenge' && selectedTemplate && (
              <>
                {templateItems.length > 0 && selectedTemplate ? (
                  <GlassSelect
                    ariaLabel="Шаблон дуэли"
                    value={selectedTemplate.id}
                    options={templateItems.map((template) => ({
                      value: template.id,
                      label: template.title,
                    }))}
                    onChange={setSelectedTemplateId}
                  />
                ) : (
                  <div style={{ color: 'var(--muted)', fontSize: 14 }}>
                    Нет активных шаблонов
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <span className="pill">
                    {formatRuCount(
                      selectedTemplate.total_periods,
                      'период',
                      'периода',
                      'периодов',
                    )}
                  </span>
                  <span className="pill">
                    {duelPeriodDurationText(selectedTemplate.period_rules[0]!)}
                  </span>
                  <span className="pill">
                    {duelPeriodModeText(selectedTemplate.period_rules[0]!)}
                  </span>
                </div>
              </>
            )}
            <SegmentedControl
              ariaLabel="Сценарий новой дуэли"
              value={duelCreationMode}
              items={[
                { id: 'matchmaking', label: 'Найти' },
                { id: 'challenge', label: 'Вызвать' },
              ]}
              onChange={(id) => setDuelCreationMode(id as 'matchmaking' | 'challenge')}
            />
            {duelCreationMode === 'matchmaking' ? (
              <>
                <DuelKindPreferencePicker
                  selected={matchmakingKinds}
                  onChange={setMatchmakingKinds}
                  onInfo={() => setMatchmakingRulesOpen(true)}
                />
                <button
                  type="button"
                  className="btn btn--cta"
                  disabled={!canStartMatchmaking}
                  onClick={() => {
                    setMatchmakingNow(Date.now());
                    matchmakingMut.mutate(matchmakingKinds);
                  }}
                >
                  {matchmakingMut.isPending
                    ? 'Запускаем поиск...'
                    : isMatchmakingActive
                      ? 'Поиск запущен'
                      : isMatchmakingExpired
                        ? 'Искать снова'
                        : 'Начать поиск'}
                </button>
                {matchmakingTicket && (
                  <div
                    className="glass"
                    style={{
                      borderRadius: 18,
                      padding: 12,
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) auto',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 900 }}>
                        {isMatchmakingExpired
                          ? 'Соперник не найден'
                          : `Ищем соперника... ${formatMs(matchmakingRemaining)}`}
                      </div>
                      <div style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 700 }}>
                        {isMatchmakingExpired
                          ? 'Можно запустить поиск ещё раз.'
                          : 'Подберём игрока с пересекающимися форматами. Поиск длится 2 минуты.'}
                      </div>
                    </div>
                    {isMatchmakingActive && (
                      <button
                        type="button"
                        className="btn btn--ghost"
                        disabled={leaveMatchmakingMut.isPending}
                        onClick={() => {
                          leaveMatchmakingMut.mutate();
                        }}
                        style={{ minHeight: 38, padding: '0 14px', fontSize: 12 }}
                      >
                        {leaveMatchmakingMut.isPending ? 'Отмена...' : 'Отменить'}
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <input
                  aria-label="Поиск соперника"
                  value={opponentQuery}
                  onChange={(event) => {
                    setOpponentQuery(event.target.value);
                    setSelectedOpponent(null);
                  }}
                  placeholder="Найти любителя или профи"
                  style={{
                    minHeight: 44,
                    borderRadius: 14,
                    border: '1px solid rgba(15,23,42,0.12)',
                    padding: '0 12px',
                    background: 'rgba(255,255,255,0.72)',
                    color: 'var(--ink)',
                    fontWeight: 700,
                  }}
                />
                {selectedOpponent && (
                  <div
                    className="glass"
                    style={{
                      borderRadius: 16,
                      padding: '10px 12px',
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) 34px',
                      gap: 10,
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div className="section-label" style={{ margin: 0, padding: 0 }}>
                        Соперник
                      </div>
                      <div
                        style={{
                          color: 'var(--ink)',
                          fontSize: 16,
                          fontWeight: 900,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {selectedOpponent.displayName}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Убрать соперника"
                      title="Убрать соперника"
                      onClick={() => setSelectedOpponent(null)}
                    >
                      <X size={15} />
                    </button>
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {opponentOptions.slice(0, 4).map((opponent) => (
                    <button
                      key={opponent.userId}
                      type="button"
                      className={
                        selectedOpponent?.userId === opponent.userId
                          ? 'btn btn--cta'
                          : 'btn btn--ghost'
                      }
                      onClick={() => {
                        setSelectedOpponent(opponent);
                        setOpponentQuery('');
                      }}
                      style={{ justifyContent: 'center' }}
                    >
                      {opponent.displayName}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn btn--cta"
                  disabled={!canChallenge}
                  onClick={() => {
                    if (!selectedTemplate || !selectedOpponent) return;
                    challengeMut.mutate({
                      template_id: selectedTemplate.id,
                      opponent_user_id: selectedOpponent.userId,
                    });
                  }}
                >
                  {challengeMut.isPending
                    ? 'Отправляем...'
                    : selectedOpponent
                      ? 'Вызвать игрока'
                      : 'Выберите соперника'}
                </button>
                {challengeMut.error && (
                  <div style={{ color: 'var(--red-deep)', fontSize: 13, fontWeight: 700 }}>
                    {challengeMut.error.message}
                  </div>
                )}
              </>
            )}
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="section-label section-label--page">Текущие дуэли</div>
            {activeMatches.length === 0 && (
              <div style={{ color: 'var(--muted)', fontSize: 14 }}>Текущих дуэлей пока нет.</div>
            )}
            {activeMatches.map((match) => (
              <DuelListCard
                key={match.id}
                match={match}
                pending={acceptMut.isPending || settleMut.isPending}
                onAccept={() => acceptMut.mutate(match.id)}
                onCancel={() => cancelMut.mutate(match.id)}
                onOpen={() => onOpenMatch(match.id)}
                onSettle={() => settleMut.mutate(match.id)}
              />
            ))}
          </section>
        </>
      )}

      {duelTab === 'locker' && <DuelLockerTab onOpenInventory={() => navigate('/inventory')} />}

      {duelTab === 'rating' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <TotalCell label="ДУЭЛИ" value={String(matches.data?.matches.length ?? 0)} />
            <TotalCell label="ТЕКУЩИЕ" value={String(activeMatches.length)} />
            <TotalCell label="ОЧКИ" value={String(myRating?.points ?? 0)} />
          </div>
          <div className="section-label section-label--page">Рейтинг</div>
          {(rating.data?.rating ?? []).length === 0 ? (
            <div className="glass" style={{ borderRadius: 18, padding: 14, color: 'var(--muted)' }}>
              Рейтинг появится после первых завершённых дуэлей.
            </div>
          ) : (
            (rating.data?.rating ?? []).slice(0, 10).map((row, index) => (
              <div
                key={row.user_id}
                className="glass"
                style={{
                  borderRadius: 16,
                  padding: '12px 14px',
                  display: 'grid',
                  gridTemplateColumns: '28px minmax(0, 1fr) auto',
                  alignItems: 'center',
                  gap: 8,
                  color: 'var(--ink)',
                  fontSize: 14,
                  fontWeight: 800,
                }}
              >
                <span>{index + 1}</span>
                <span
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {row.display_name}
                </span>
                <span>{row.points}</span>
              </div>
            ))
          )}
        </section>
      )}

      {duelTab === 'history' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="section-label section-label--page">История</div>
          {history.length === 0 ? (
            <div className="glass" style={{ borderRadius: 18, padding: 14, color: 'var(--muted)' }}>
              Архив появится после первых завершённых дуэлей.
            </div>
          ) : (
            history.slice(0, 12).map((match) => (
              <DuelListCard
                key={match.id}
                match={match}
                pending={false}
                onAccept={() => {}}
                onCancel={() => {}}
                onOpen={() => onOpenMatch(match.id)}
                onSettle={() => {}}
              />
            ))
          )}
        </section>
      )}
      {matchmakingRulesOpen && (
        <ModeInfoModal
          title="Правила поиска"
          text="Поиск длится 2 минуты. Можно выбрать один или несколько форматов. Если выбрано Все, соперник найдётся в любом формате; иначе подберём игрока с пересекающимся выбором. После подбора оба игрока попадут в комнату готовности."
          onClose={() => setMatchmakingRulesOpen(false)}
        />
      )}
    </ModeShell>
  );
}

function DuelLockerTab({ onOpenInventory }: { onOpenInventory: () => void }): JSX.Element {
  return (
    <>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="section-label section-label--page">Раздевалка</div>
        <div className="glass" style={{ borderRadius: 18, padding: 14 }}>
          <div style={{ color: 'var(--ink)', fontSize: 18, fontWeight: 950, marginBottom: 6 }}>
            Инвентарь для дуэлей
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.45, fontWeight: 700 }}>
            Предметы выбираются перед стартом матча в комнате готовности. Здесь будет настройка
            набора по умолчанию для быстрых дуэлей.
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {DUEL_INVENTORY_SLOTS.map((slot) => (
            <div
              key={slot.kind}
              className="glass"
              style={{
                borderRadius: 16,
                padding: 10,
                minHeight: 112,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                textAlign: 'center',
              }}
            >
              <img
                src={slot.artwork}
                alt=""
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  objectFit: 'cover',
                  filter: 'grayscale(1)',
                  opacity: 0.7,
                }}
              />
              <div
                style={{
                  color: 'var(--ink)',
                  fontSize: 12,
                  fontWeight: 950,
                  lineHeight: 1.1,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                {slot.label}
              </div>
            </div>
          ))}
        </div>
      </section>
      <button type="button" className="btn btn--ghost" onClick={onOpenInventory}>
        Открыть инвентарь
      </button>
    </>
  );
}

function DuelListCard({
  match,
  pending,
  onAccept,
  onCancel,
  onOpen,
  onSettle,
}: {
  match: AmateurDuelMatch;
  pending: boolean;
  onAccept: () => void;
  onCancel: () => void;
  onOpen: () => void;
  onSettle: () => void;
}): JSX.Element {
  const incomingInvite = match.status === 'invited' && match.me.state === 'invited';
  const outgoingInvite = match.status === 'invited' && match.me.state !== 'invited';
  const playable = match.status === 'ready_check' || match.status === 'active';
  return (
    <div
      className="glass"
      style={{ borderRadius: 18, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '42px minmax(0, 1fr) auto',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <UserAvatar
          avatarUrl={match.opponent.avatar_url}
          name={match.opponent.display_name}
          size={42}
          fontSize={16}
          style={{
            border: '1px solid rgba(255,255,255,0.78)',
            boxShadow: '0 10px 18px rgba(15,23,42,0.16)',
          }}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 900, color: 'var(--ink)', fontSize: 15 }}>
            {match.opponent.display_name}
          </div>
          <div
            style={{
              color: 'var(--muted)',
              fontSize: 12,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {duelKindText(match.rules.duelKind)}
          </div>
        </div>
        <DuelStatusBadge match={match} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <TotalCell label="СЧЁТ" value={`${match.me.goals}:${match.opponent.goals}`} />
        <TotalCell label="ПЕРИОД" value={duelProgressText(match)} />
        <TotalCell label="ТИП" value={duelKindText(match.rules.duelKind)} />
      </div>
      {incomingInvite ? (
        <button type="button" className="btn btn--cta" disabled={pending} onClick={onAccept}>
          Принять вызов
        </button>
      ) : outgoingInvite ? (
        <button type="button" className="btn btn--ghost" disabled={pending} onClick={onCancel}>
          Отменить вызов
        </button>
      ) : playable ? (
        <button type="button" className="btn btn--cta" disabled={pending} onClick={onOpen}>
          Перейти
        </button>
      ) : match.status !== 'settled' &&
        match.status !== 'expired' &&
        match.status !== 'cancelled' ? (
        <button type="button" className="btn btn--ghost" disabled={pending} onClick={onSettle}>
          Обновить итог
        </button>
      ) : (
        <button type="button" className="btn btn--ghost" onClick={onOpen}>
          Детали
        </button>
      )}
    </div>
  );
}

function AmateurDuelPlayView({
  matchId,
  onBack,
}: {
  matchId: string;
  onBack: () => void;
}): JSX.Element {
  const match = useAmateurDuelStore((s) => s.match);
  const loading = useAmateurDuelStore((s) => s.loading);
  const error = useAmateurDuelStore((s) => s.error);
  const inFlight = useAmateurDuelStore((s) => s.inFlight);
  const load = useAmateurDuelStore((s) => s.load);
  const refresh = useAmateurDuelStore((s) => s.refresh);
  const ready = useAmateurDuelStore((s) => s.ready);
  const startPeriod = useAmateurDuelStore((s) => s.startPeriod);
  const optimisticAddShot = useAmateurDuelStore((s) => s.optimisticAddShot);
  const submitShot = useAmateurDuelStore((s) => s.submitShot);
  const applyState = useAmateurDuelStore((s) => s.applyState);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    void load(matchId);
  }, [load, matchId]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!match || match.id !== matchId) return;
    const endsAtMs = new Date(match.ends_at).getTime();
    const breakEndsAtMs = match.break_ends_at ? new Date(match.break_ends_at).getTime() : 0;
    if (match.me.state === 'break_active' && breakEndsAtMs > 0 && now >= breakEndsAtMs) {
      void refresh();
    }
    if (
      match.status !== 'settled' &&
      match.status !== 'cancelled' &&
      match.status !== 'expired' &&
      now >= endsAtMs
    ) {
      void settleAmateurDuel(match.id).then(({ match: next }) => applyState(next));
    }
  }, [applyState, match, matchId, now, refresh]);

  if (!match || match.id !== matchId) {
    return (
      <ModeShell title="Дуэль" onBack={onBack}>
        <div style={{ color: error ? 'var(--red-deep)' : 'var(--muted)', fontSize: 14 }}>
          {error ?? (loading ? 'Загрузка...' : 'Открываем матч...')}
        </div>
      </ModeShell>
    );
  }

  const startsAt = new Date(match.starts_at).getTime();
  const endsAt = new Date(match.ends_at).getTime();
  const breakEndsAt = match.break_ends_at ? new Date(match.break_ends_at).getTime() : 0;
  const periodEndsAt = match.period_ends_at ? new Date(match.period_ends_at).getTime() : undefined;
  const canStart =
    match.status === 'active' &&
    match.me.state === 'accepted' &&
    now >= startsAt &&
    now < endsAt &&
    match.me.current_period < match.rules.totalPeriods;
  const nextPeriod =
    match.me.state === 'period_active'
      ? match.me.current_period
      : Math.min(match.rules.totalPeriods, match.me.current_period + 1);
  const nextPeriodRule = currentDuelPeriodRule(match);

  if (match.status === 'ready_check') {
    const readyEndsAt = match.ready_expires_at ? new Date(match.ready_expires_at).getTime() : 0;
    const readyText = readyEndsAt > now ? formatMs(readyEndsAt - now) : '00:00';
    return (
      <ModeShell title="Комната дуэли" onBack={onBack}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <TotalCell label="ФОРМАТ" value={`${match.rules.totalPeriods}П`} />
          <TotalCell
            label="ТИП"
            value={duelKindText(match.rules.duelKind)}
          />
          <TotalCell label="ГОТОВ" value={readyText} />
        </div>
        <div className="glass" style={{ borderRadius: 18, padding: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--ink)', marginBottom: 6 }}>
            {match.rules.title}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.45 }}>
            Против {match.opponent.display_name}. Инвентарь выбирается здесь; в MVP можно выйти
            без предметов.
          </div>
        </div>
        <DuelLoadoutSummary match={match} />
        {error && (
          <div style={{ color: 'var(--red-deep)', fontSize: 13, fontWeight: 700 }}>{error}</div>
        )}
        <button
          type="button"
          className="btn btn--cta"
          disabled={inFlight || match.me.state === 'ready'}
          onClick={() => void ready({})}
        >
          {match.me.state === 'ready' ? 'Вы готовы' : inFlight ? 'Фиксируем...' : 'Готов'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={refresh}>
          Обновить комнату
        </button>
      </ModeShell>
    );
  }

  if (match.me.state === 'period_active') {
    const activePeriodRule = currentDuelPeriodRule(match);
    return (
      <PlayView<AmateurDuelMatchState>
        suppressedByModal={false}
        showIceCar={false}
        onBack={onBack}
        active={match.status === 'active'}
        seed={match.match_seed}
        goalieId={match.rules.goalieId}
        periodNumber={match.me.current_period}
        periodSpeedPresets={match.period_speed_presets}
        stickEffects={match.stick_effects}
        periodsTotal={match.rules.totalPeriods}
        sessionStartedAt={match.period_started_at}
        serverNow={match.server_now}
        receivedAtPerformanceMs={match.received_at_performance_ms}
        goals={match.current_period_goals}
        shots={match.current_period_shots}
        shotsTotal={activePeriodRule.mode === 'quota' ? (activePeriodRule.shotsLimit ?? 30) : undefined}
        periodEndsAt={periodEndsAt}
        onTimerExpired={refresh}
        backLabel="К дуэлям"
        optimisticAddShot={optimisticAddShot}
        submitShot={submitShot}
        applyState={applyState}
        hudAddon={<DuelInventoryMiniHud match={match} />}
        scoreboardOpponent={duelScoreboardOpponent(match)}
      />
    );
  }

  const statusText =
    match.status === 'settled'
      ? duelOutcomeText(match)
      : match.me.state === 'forfeit'
        ? 'Период не завершён: время вышло до квоты бросков'
        : match.me.state === 'completed'
          ? 'Вы завершили игру, ждём итог'
          : match.me.state === 'break_active'
            ? `Перерыв ${formatMs(Math.max(0, breakEndsAt - now))}`
            : match.status === 'expired' || match.status === 'cancelled'
              ? match.settled_reason === 'declined'
                ? 'Вызов отклонён'
                : match.status === 'cancelled'
                  ? 'Дуэль отменена'
                  : 'Вызов истёк'
              : 'Готово к периоду';
  const startButtonLabel = canStart
    ? 'Начать период'
    : match.me.state === 'forfeit'
      ? 'Период не завершён'
      : match.me.state === 'completed'
        ? 'Ждём итог'
        : 'Период недоступен';

  return (
    <ModeShell title="Дуэль" onBack={onBack}>
      <DuelOpponentPanel match={match} />
      <DuelRulesPanel match={match} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <TotalCell label="ГОЛЫ" value={`${match.me.goals}:${match.opponent.goals}`} />
        <TotalCell label="ВРЕМЯ" value={formatDurationMs(match.me.active_duration_ms)} />
        <TotalCell
          label="ПЕРИОД"
          value={`${match.me.current_period}/${match.rules.totalPeriods}`}
        />
      </div>
      <DuelLoadoutSummary match={match} />
      <div style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.45 }}>
        {statusText}. При равных голах решает суммарное активное время периодов.
      </div>
      {error && (
        <div style={{ color: 'var(--red-deep)', fontSize: 13, fontWeight: 700 }}>{error}</div>
      )}
      {canStart && (
        <StartPeriodModal
          nextPeriod={nextPeriod}
          totalPeriods={match.rules.totalPeriods}
          shotsPerPeriod={nextPeriodRule.shotsLimit ?? match.rules.shotsPerPeriod}
          periodDescription={duelPeriodStartText(nextPeriodRule)}
          isFirstPeriod={match.me.current_period === 0}
          pending={inFlight}
          onHome={onBack}
          onStart={() => void startPeriod()}
        />
      )}
      <button
        type="button"
        className="btn btn--cta"
        disabled={!canStart || inFlight}
        onClick={() => void startPeriod()}
      >
        {startButtonLabel}
      </button>
    </ModeShell>
  );
}

function DuelRulesPanel({ match }: { match: AmateurDuelMatch }): JSX.Element {
  const artwork = DUEL_KIND_ARTWORK_IMAGES[match.rules.duelKind];
  const chips = [
    formatRuCount(match.rules.totalPeriods, 'период', 'периода', 'периодов'),
    ...match.rules.periodRules.flatMap((rule) => {
      const prefix = match.rules.totalPeriods > 1 ? `${rule.periodNumber}П: ` : '';
      return [`${prefix}${duelPeriodDurationText(rule)}`, duelPeriodModeText(rule)];
    }),
    ...(match.rules.breakDurationMs > 0 ? [`перерыв ${formatMs(match.rules.breakDurationMs)}`] : []),
  ];

  return (
    <div
      className="glass"
      style={{
        borderRadius: 18,
        padding: 12,
        display: 'grid',
        gridTemplateColumns: '72px minmax(0, 1fr)',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <img
        src={artwork}
        alt=""
        style={{
          width: 72,
          height: 72,
          borderRadius: 16,
          objectFit: 'cover',
          border: '1px solid rgba(255,255,255,0.8)',
          boxShadow: '0 12px 22px rgba(15,23,42,0.14)',
        }}
      />
      <div style={{ display: 'flex', minWidth: 0, flexDirection: 'column', gap: 10 }}>
        <div
          style={{
            color: 'var(--ink)',
            fontSize: 18,
            fontWeight: 950,
            lineHeight: 1.05,
          }}
        >
          {duelKindText(match.rules.duelKind)}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {chips.map((chip) => (
            <span
              key={chip}
              className="pill"
              style={{
                fontSize: 11,
                padding: '7px 10px',
                letterSpacing: '0',
                textTransform: 'none',
                whiteSpace: 'normal',
                lineHeight: 1.1,
              }}
            >
              {chip}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function DuelOpponentPanel({ match }: { match: AmateurDuelMatch }): JSX.Element {
  const opponentStatus = duelOpponentStatus(match.opponent);
  const opponentName = splitOpponentName(match.opponent.display_name);
  return (
    <div
      className="glass"
      style={{
        borderRadius: 18,
        padding: 12,
        display: 'grid',
        gridTemplateColumns: '48px minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <UserAvatar
        avatarUrl={match.opponent.avatar_url}
        name={match.opponent.display_name}
        size={48}
        fontSize={17}
        style={{
          border: '1px solid rgba(255,255,255,0.78)',
          boxShadow: '0 10px 18px rgba(15,23,42,0.16)',
        }}
      />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            color: 'var(--ink)',
            fontSize: 18,
            fontWeight: 950,
            lineHeight: 1.05,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {opponentName.first}
        </div>
        {opponentName.second && (
          <div
            style={{
              marginTop: 3,
              color: 'var(--ink)',
              fontSize: 18,
              fontWeight: 950,
              lineHeight: 1.05,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {opponentName.second}
          </div>
        )}
      </div>
      <div
        aria-label={`Статус соперника: ${opponentStatus.label}`}
        style={{
          borderRadius: 999,
          padding: '7px 10px 7px 8px',
          background: 'rgba(15, 23, 42, 0.08)',
          color: 'var(--ink)',
          fontSize: 11,
          fontWeight: 900,
          whiteSpace: 'nowrap',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: opponentStatus.color,
            boxShadow: `0 0 0 3px ${opponentStatus.glow}, 0 0 10px ${opponentStatus.glow}`,
            flexShrink: 0,
          }}
        />
        {opponentStatus.label}
      </div>
    </div>
  );
}

function splitOpponentName(displayName: string): { first: string; second: string } {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { first: 'Игрок', second: '' };
  }
  const [first, ...rest] = parts;
  return { first: first ?? 'Игрок', second: rest.join(' ') };
}

function duelOpponentStatus(participant: AmateurDuelMatch['opponent']): {
  label: string;
  color: string;
  glow: string;
} {
  if (participant.state === 'period_active') {
    return {
      label: `играет ${participant.current_period}П`,
      color: '#0ea5e9',
      glow: 'rgba(14, 165, 233, 0.2)',
    };
  }
  if (participant.state === 'break_active') {
    return { label: 'перерыв', color: '#64748b', glow: 'rgba(100, 116, 139, 0.18)' };
  }
  if (participant.state === 'completed') {
    return { label: 'завершил', color: '#6366f1', glow: 'rgba(99, 102, 241, 0.2)' };
  }
  if (participant.state === 'forfeit') {
    return { label: 'не завершил', color: '#ef4444', glow: 'rgba(239, 68, 68, 0.18)' };
  }
  if (participant.state === 'ready') {
    return { label: 'готов', color: '#22c55e', glow: 'rgba(34, 197, 94, 0.18)' };
  }
  if (participant.state === 'accepted') {
    return { label: 'готов к периоду', color: '#22c55e', glow: 'rgba(34, 197, 94, 0.18)' };
  }
  if (participant.state === 'loadout_pending') {
    return { label: 'выбирает', color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.2)' };
  }
  if (participant.state === 'invited') {
    return { label: 'ждёт ответ', color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.2)' };
  }
  return { label: 'ожидает', color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.2)' };
}

function DuelLoadoutSummary({ match }: { match: AmateurDuelMatch }): JSX.Element {
  return (
    <div
      className="glass"
      style={{ borderRadius: 18, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontWeight: 900, color: 'var(--ink)', fontSize: 14 }}>Ваш инвентарь</div>
        <div style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 900 }}>
          {match.me.loadout.powerScore}/{match.me.loadout.powerCap}
        </div>
      </div>
      <DuelInventorySlots match={match} />
      {match.me.inventory_report.length > 0 && (
        <div style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.45 }}>
          Последний отчёт: период {match.me.inventory_report.at(-1)?.periodNumber}, списано{' '}
          {match.me.inventory_report
            .at(-1)
            ?.consumed.reduce((sum, item) => sum + item.charges, 0) ?? 0}{' '}
          зарядов.
        </div>
      )}
    </div>
  );
}

function duelScoreboardOpponent(match: AmateurDuelMatch): ScoreBoardOpponent {
  const opponent = match.opponent;
  const activeTime = opponent.active_duration_ms > 0 ? formatMs(opponent.active_duration_ms) : null;
  const time =
    opponent.state === 'period_active'
      ? 'играет'
      : opponent.state === 'break_active'
        ? (activeTime ?? 'перерыв')
        : opponent.state === 'completed'
          ? (activeTime ?? 'финиш')
          : opponent.state === 'forfeit'
            ? 'время'
            : opponent.state === 'ready' || opponent.state === 'accepted'
              ? 'готов'
              : opponent.state === 'loadout_pending'
                ? 'выбор'
                : 'ждёт';
  const timeTone =
    opponent.state === 'forfeit'
      ? 'danger'
      : opponent.state === 'period_active'
        ? 'active'
        : 'muted';

  return {
    name: opponent.display_name || 'Соперник',
    avatarUrl: opponent.avatar_url,
    goals: opponent.goals,
    shots: opponent.shots_taken,
    time,
    timeTone,
  };
}

const DUEL_INVENTORY_SLOTS = [
  { kind: 'skates', label: 'Коньки', artwork: '/inventory/skates.webp' },
  { kind: 'stick', label: 'Клюшка', artwork: '/inventory/sticks.webp' },
  { kind: 'nutrition', label: 'Энергия', artwork: '/inventory/nutrition.webp' },
] as const;

function DuelInventorySlots({
  match,
  compact = false,
}: {
  match: AmateurDuelMatch;
  compact?: boolean;
}): JSX.Element {
  const items = match.me.loadout.items;
  const availableItems = match.me.inventory_available ?? [];
  const iconSize = compact ? 30 : 42;

  return (
    <div
      aria-label={items.length > 0 ? 'Инвентарь дуэли' : 'Инвентарь дуэли: ничего не выбрано'}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: compact ? 6 : 8,
      }}
    >
      {DUEL_INVENTORY_SLOTS.map((slot) => {
        const item = items.find((cur) => cur.kind === slot.kind);
        const available = availableItems.find(
          (cur) => cur.kind === slot.kind && cur.chargesAvailable > 0,
        );
        const hasAvailable = available !== undefined;
        const rarityColor =
          (item?.rarity ?? available?.rarity) === 'legendary'
            ? '#f59e0b'
            : (item?.rarity ?? available?.rarity) === 'epic'
              ? '#a855f7'
              : (item?.rarity ?? available?.rarity) === 'rare'
                ? '#0ea5e9'
                : '#64748b';
        const emptyText = hasAvailable ? 'не выбрано' : 'нет в наличии';
        return (
          <div
            key={slot.kind}
            style={{
              minHeight: compact ? 42 : 98,
              borderRadius: 12,
              padding: compact ? '7px' : '9px',
              display: 'grid',
              gridTemplateColumns: compact ? `${iconSize}px minmax(0, 1fr)` : '1fr',
              gridTemplateRows: compact ? undefined : `${iconSize}px auto`,
              gap: compact ? 6 : 7,
              alignItems: 'center',
              justifyItems: compact ? undefined : 'center',
              background: item ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.34)',
              border: '1px solid rgba(255,255,255,0.74)',
              color: item ? 'var(--ink)' : 'var(--muted)',
              minWidth: 0,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: iconSize,
                height: iconSize,
                borderRadius: 10,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                background: item ? `${rarityColor}18` : 'rgba(15,23,42,0.05)',
                border: item ? `1px solid ${rarityColor}66` : '1px solid rgba(15,23,42,0.08)',
                boxShadow: item ? `0 0 12px ${rarityColor}33` : 'none',
              }}
            >
              <img
                src={slot.artwork}
                alt=""
                style={{
                  width: iconSize,
                  height: iconSize,
                  objectFit: 'cover',
                  filter: item ? 'none' : 'grayscale(1)',
                  opacity: item ? 1 : hasAvailable ? 0.68 : 0.44,
                }}
              />
            </span>
            <div style={{ minWidth: 0, width: '100%', textAlign: compact ? 'left' : 'center' }}>
              <div
                style={{
                  fontSize: compact ? 9 : 10,
                  fontWeight: 900,
                  letterSpacing: compact ? '0.08em' : '0.04em',
                  textTransform: 'uppercase',
                  lineHeight: 1.08,
                  whiteSpace: compact ? 'nowrap' : 'normal',
                  overflow: compact ? 'hidden' : 'visible',
                  textOverflow: compact ? 'ellipsis' : 'clip',
                  overflowWrap: 'anywhere',
                }}
              >
                {item?.title ?? slot.label}
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: compact ? 10 : 11,
                  fontWeight: 900,
                  lineHeight: 1.08,
                  whiteSpace: compact ? 'nowrap' : 'normal',
                  overflow: compact ? 'hidden' : 'visible',
                  textOverflow: compact ? 'ellipsis' : 'clip',
                  overflowWrap: 'anywhere',
                }}
              >
                {item
                  ? `${item.chargesReserved} зар.`
                  : emptyText}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DuelInventoryMiniHud({ match }: { match: AmateurDuelMatch }): JSX.Element {
  return (
    <div style={{ marginTop: 8 }}>
      <DuelInventorySlots match={match} compact />
    </div>
  );
}

function LevelPlaceholder({
  level,
  onBack,
}: {
  level: Exclude<GameLevel, 'beginner'>;
  onBack: () => void;
}): JSX.Element {
  const isAmateur = level === 'amateur';
  return (
    <ModeShell title={isAmateur ? 'Любители' : 'Профессионалы'} onBack={onBack}>
      {isAmateur ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
            <TotalCell label="ДОСТУП" value="1000" />
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.45 }}>
            Раздел откроется после 1000 голов в дневной игре начального уровня.
          </div>
        </>
      ) : (
        <div style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.45 }}>
          Профессиональный раздел в разработке.
        </div>
      )}
      <button type="button" className="btn btn--cta" disabled>
        {isAmateur ? 'Закрыто' : 'В разработке'}
      </button>
    </ModeShell>
  );
}

function PeriodSpeedSummary({
  periodNumber,
  presets,
}: {
  periodNumber: 1 | 2 | 3;
  presets?: readonly DailyPeriodSpeedPreset[] | undefined;
}): JSX.Element {
  const preset = periodSpeedPresetFor(periodNumber, presets);
  const items = [
    { label: 'Ворота', value: `${formatSpeedValue(preset.goalFrequency)}/с` },
    { label: 'Вратарь', value: `${formatSpeedValue(preset.goalieFrequency)}/с` },
    { label: 'Игрок', value: `${formatSpeedValue(preset.shooterFrequency)}/с` },
    { label: 'Шайба', value: `${formatSpeedValue(preset.puckSpeedPerMs)} ед/мс` },
  ];

  return (
    <div
      aria-label={`${periodNumber}-й период: скорости`}
      style={{
        padding: 12,
        borderRadius: 18,
        background: 'rgba(255, 255, 255, 0.34)',
        border: '1px solid rgba(255, 255, 255, 0.64)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.68)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        style={{
          color: 'rgba(15, 23, 42, 0.58)',
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
        }}
      >
        Скорости {periodNumber}-го периода
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        {items.map((item) => (
          <div key={item.label} style={{ minWidth: 0 }}>
            <div
              style={{
                color: 'rgba(15, 23, 42, 0.54)',
                fontSize: 11,
                fontWeight: 800,
                lineHeight: 1.1,
              }}
            >
              {item.label}
            </div>
            <div
              style={{
                marginTop: 3,
                color: 'var(--ink)',
                fontSize: 15,
                fontWeight: 900,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.1,
              }}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TotalCell({ label, value }: { label: string; value: string }): JSX.Element {
  const isLongLabel = label.length > 9;
  const isLongValue = value.length > 5;
  return (
    <div
      style={{
        padding: '10px 4px',
        borderRadius: 14,
        background:
          'linear-gradient(180deg, rgba(255, 255, 255, 0.7) 0%, rgba(226, 232, 240, 0.55) 100%)',
        border: '1px solid rgba(15, 23, 42, 0.06)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.95)',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: isLongLabel ? 7 : 9,
          letterSpacing: isLongLabel ? '0.08em' : '0.18em',
          lineHeight: 1.1,
          fontWeight: 800,
          color: 'var(--muted)',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: isLongValue ? 16 : 18,
          fontWeight: 800,
          color: 'var(--ink)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  );
}

interface PlayViewProps<TState> {
  suppressedByModal: boolean;
  showIceCar: boolean;
  onBack: () => void;
  active: boolean;
  seed: string | null;
  goalieId: string;
  periodNumber: number;
  periodSpeedPresets?: readonly DailyPeriodSpeedPreset[] | undefined;
  stickEffects?: StickEffects | undefined;
  periodsTotal?: number;
  goals: number;
  shots: number;
  shotsTotal?: number | undefined;
  timer?: string | undefined;
  timerLabel?: string | undefined;
  shotButtonLabel?: string | undefined;
  backLabel?: string | undefined;
  bottomInset?: string | undefined;
  sessionStartedAt?: string | null | undefined;
  serverNow?: string | null | undefined;
  receivedAtPerformanceMs?: number | undefined;
  periodEndsAt?: number | undefined;
  onTimerExpired?: (() => void | Promise<void>) | undefined;
  optimisticAddShot: (claimed: ShotResultType) => void;
  submitShot: (args: {
    shotIndex: number;
    input: ShotInputPayload;
    claimedResult: ShotResultType;
  }) => Promise<{ serverResult: ShotResultType; state: TState } | null>;
  applyState: (next: TState) => void;
  applyResolvedState?: ((next: TState) => void) | undefined;
  rinkLayer?: ReactNode;
  rinkAspectRatio?: string | undefined;
  rinkBorderRadius?: number | string | undefined;
  rinkBorder?: string | undefined;
  gameLayerStyle?: CSSProperties | undefined;
  playerGrip?: 'left' | 'right' | undefined;
  playerOptions?: PlayerOptions | undefined;
  goalOptions?: GoalOptions | undefined;
  goalieOptions?: GoalieOptions | undefined;
  puckOptions?: PuckOptions | undefined;
  hitboxesVisible?: boolean | undefined;
  hitboxesOptions?: HitboxesOptions | undefined;
  shotResolver?: PlayShotResolver | undefined;
  hudAddon?: ReactNode;
  scoreboardOpponent?: ScoreBoardOpponent | undefined;
}

interface PlaySessionSnapshot {
  active: boolean;
  seed: string | null;
  goalieId: string;
  periodNumber: number;
  shots: number;
  shotsTotal: number | undefined;
}

interface PlaySessionTiming {
  sessionStartedAt: string | null;
  serverNow: string | null;
  receivedAtPerformanceMs: number | null;
}

interface DailyStatsModalState {
  stats: DailyGameStats;
  source: 'deferred' | 'state';
  state: DailyStateResponse['state'];
}

function computeInitialElapsedMs(timing: PlaySessionTiming): number {
  if (!timing.sessionStartedAt || !timing.serverNow) return 0;
  const started = Date.parse(timing.sessionStartedAt);
  const serverNowMs = Date.parse(timing.serverNow);
  if (!Number.isFinite(started) || !Number.isFinite(serverNowMs)) return 0;
  const syncedElapsed = Math.max(0, serverNowMs - started);
  const receivedAt = timing.receivedAtPerformanceMs ?? performance.now();
  return syncedElapsed + Math.max(0, performance.now() - receivedAt);
}

function DailyPlayView({ onBack }: { onBack: () => void }): JSX.Element {
  const data = useDailyStore((s) => s.data)!;
  const deferredState = useDailyStore((s) => s.deferredState);
  const startPeriod = useDailyStore((s) => s.startPeriod);
  const pending = useDailyStore((s) => s.inFlight);
  const optimisticAddShot = useDailyStore((s) => s.optimisticAddShot);
  const submitShot = useDailyStore((s) => s.submitShot);
  const refresh = useDailyStore((s) => s.refresh);
  const applyState = useDailyStore((s) => s.applyState);
  const setDeferredState = useDailyStore((s) => s.setDeferredState);
  const applyDeferredState = useDailyStore((s) => s.applyDeferredState);
  const userId = useAuthStore((s) => s.user?.id ?? '');
  const isBreak = data.state === 'break_active';
  const isClosed = data.state === 'closed';
  const canStartPeriod = data.state === 'idle' && data.current_period < data.total_periods;
  const periodNumber = isBreak
    ? Math.min(data.current_period + 1, data.total_periods)
    : data.state === 'period_active'
      ? data.current_period || 1
      : canStartPeriod
        ? data.current_period === 0
          ? 1
          : data.current_period + 1
        : data.current_period > 0
          ? data.current_period
          : data.total_periods;
  const periodEndsAt = data.period_ends_at ? new Date(data.period_ends_at).getTime() : undefined;
  const breakEndsAt = data.break_ends_at ? new Date(data.break_ends_at).getTime() : undefined;
  const [now, setNow] = useState(Date.now());
  const [statsModal, setStatsModal] = useState<DailyStatsModalState | null>(null);

  useEffect(() => {
    if (statsModal !== null) return;

    if (deferredState && deferredState.state !== 'period_active') {
      const stats = dailyGameStatsFromState(deferredState);
      if (stats) {
        setStatsModal({ stats, source: 'deferred', state: deferredState.state });
      }
      return;
    }

    const unseenPeriod = findUnseenPeriodSummary(data, userId);
    if (!unseenPeriod) return;

    if (data.state === 'break_active' || data.state === 'closed') {
      const stats = dailyGameStatsFromState(data);
      if (stats) setStatsModal({ stats, source: 'state', state: data.state });
    }
  }, [data, deferredState, statsModal, userId]);

  const applyDailyResolvedState = useCallback(
    (next: DailyStateResponse): void => {
      const stats = dailyGameStatsFromState(next);
      if (next.state !== 'period_active' && stats) {
        setDeferredState(next);
        return;
      }
      applyState(next);
    },
    [applyState, setDeferredState],
  );

  const handleStatsModalClose = useCallback((): void => {
    const source = statsModal?.source;
    setStatsModal(null);
    if (source === 'deferred') {
      applyDeferredState();
      onBack();
      return;
    }

    const latestPeriod = latestPeriodFromStats(statsModal?.stats ?? null);
    if (latestPeriod && userId) setLastSeenAt(userId, latestPeriod.ended_at);
  }, [applyDeferredState, onBack, statsModal, userId]);

  const hasStatsModal = statsModal !== null;
  const shouldSuppressRink = data.state !== 'period_active' || hasStatsModal;

  useEffect(() => {
    if ((!isBreak || !breakEndsAt) && !isClosed) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [breakEndsAt, isBreak, isClosed]);

  const breakRemaining = breakEndsAt ? Math.max(0, breakEndsAt - now) : 0;
  const nextDayAt = new Date(data.next_day_starts_at).getTime();
  const nextDayRemaining = Math.max(0, nextDayAt - now);

  useEffect(() => {
    if (isBreak && breakEndsAt && breakRemaining === 0) void refresh();
    if (isClosed && nextDayAt > 0 && nextDayRemaining === 0) void refresh();
  }, [breakEndsAt, breakRemaining, isBreak, isClosed, nextDayAt, nextDayRemaining, refresh]);

  return (
    <>
      <PlayView<DailyStateResponse>
        suppressedByModal={shouldSuppressRink}
        showIceCar={isBreak || isClosed || hasStatsModal}
        onBack={onBack}
        active={data.state === 'period_active'}
        seed={data.daily_seed}
        goalieId={data.goalie_id}
        periodNumber={periodNumber}
        periodSpeedPresets={data.period_speed_presets}
        sessionStartedAt={data.period_started_at}
        serverNow={data.server_now}
        receivedAtPerformanceMs={data.received_at_performance_ms}
        goals={isBreak || isClosed ? data.daily_total_goals : data.current_period_goals}
        shots={isBreak || isClosed ? data.daily_total_shots : data.current_period_shots}
        shotsTotal={
          isBreak || isClosed ? data.shots_per_period * data.total_periods : data.shots_per_period
        }
        timer={
          isBreak
            ? formatMs(breakRemaining)
            : isClosed
              ? formatHms(nextDayRemaining)
              : data.state === 'idle'
                ? '20:00'
                : undefined
        }
        timerLabel={isBreak ? 'ПЕРЕРЫВ' : isClosed ? 'ДО ОБНОВЛЕНИЯ' : undefined}
        shotButtonLabel={isBreak ? 'ПЕРЕРЫВ' : isClosed ? 'ДЕНЬ ЗАВЕРШЁН' : undefined}
        periodEndsAt={data.state === 'period_active' ? periodEndsAt : undefined}
        onTimerExpired={refresh}
        optimisticAddShot={optimisticAddShot}
        submitShot={submitShot}
        applyState={applyState}
        applyResolvedState={applyDailyResolvedState}
      />
      {statsModal && (
        <DailyGameStatsModal
          stats={statsModal.stats}
          totalPeriods={data.total_periods}
          title={statsModal.state === 'closed' ? 'Игра завершена' : 'Итоги ежедневной игры'}
          ariaLabel={statsModal.state === 'closed' ? 'Игра завершена' : 'Итоги ежедневной игры'}
          closeLabel="Понятно"
          onClose={handleStatsModalClose}
        />
      )}
      {canStartPeriod && !hasStatsModal && (
        <StartPeriodModal
          nextPeriod={periodNumber}
          totalPeriods={data.total_periods}
          shotsPerPeriod={data.shots_per_period}
          isFirstPeriod={data.current_period === 0}
          pending={pending}
          onHome={onBack}
          onStart={() => void startPeriod()}
        />
      )}
      {isClosed && !hasStatsModal && (
        <DailyClosedModal timer={formatHms(nextDayRemaining)} onBack={onBack} />
      )}
    </>
  );
}

function DailyClosedModal({ timer, onBack }: { timer: string; onBack: () => void }): JSX.Element {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="День завершён"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 400,
        background: 'rgba(15, 23, 42, 0.18)',
        backdropFilter: 'blur(6px) saturate(130%)',
        WebkitBackdropFilter: 'blur(6px) saturate(130%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 360,
          padding: '28px 24px 22px',
          borderRadius: 28,
          textAlign: 'center',
          background:
            'linear-gradient(180deg, rgba(255, 255, 255, 0.90) 0%, rgba(241, 245, 249, 0.88) 100%)',
          backdropFilter: 'blur(22px) saturate(160%)',
          WebkitBackdropFilter: 'blur(22px) saturate(160%)',
          border: '1px solid rgba(255, 255, 255, 0.65)',
          boxShadow:
            '0 30px 80px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(15, 23, 42, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
        }}
      >
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>День завершён</div>
        <div
          style={{
            marginTop: 10,
            color: 'var(--muted)',
            fontSize: 15,
            lineHeight: 1.45,
            fontWeight: 700,
          }}
        >
          Новая игра будет доступна через {timer}.
        </div>
        <button
          type="button"
          className="btn btn--cta"
          onClick={onBack}
          style={{ marginTop: 22, width: '100%', paddingBlock: 16 }}
        >
          К режимам
        </button>
      </div>
    </div>
  );
}

function TrainingCourtDesignSwitch({
  value,
  onChange,
}: {
  value: TrainingCourtDesign;
  onChange: (value: TrainingCourtDesign) => void;
}): JSX.Element {
  const options: Array<{ value: TrainingCourtDesign; label: string }> = [
    { value: 'standard', label: 'Стандарт' },
    { value: 'new', label: 'Новая' },
  ];

  return (
    <div
      role="group"
      aria-label="Дизайн тренировочной площадки"
      style={{
        position: 'fixed',
        top: 'calc(var(--app-safe-top) + 78px)',
        right: 12,
        zIndex: 540,
        display: 'flex',
        gap: 3,
        padding: 4,
        borderRadius: 999,
        background: 'rgba(8, 24, 43, 0.72)',
        border: '1px solid rgba(255, 255, 255, 0.24)',
        boxShadow: '0 12px 28px rgba(7, 19, 33, 0.2)',
        backdropFilter: 'blur(14px)',
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            style={{
              minWidth: 74,
              minHeight: 30,
              border: 0,
              borderRadius: 999,
              padding: '7px 11px',
              background: selected ? 'rgba(255, 255, 255, 0.95)' : 'transparent',
              color: selected ? '#12304d' : 'rgba(255, 255, 255, 0.82)',
              fontSize: 11,
              fontWeight: 900,
              lineHeight: 1,
              cursor: 'pointer',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function TrainingHitboxesToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}): JSX.Element {
  return (
    <label
      style={{
        position: 'fixed',
        top: 'calc(var(--app-safe-top) + 78px)',
        left: 12,
        zIndex: 540,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 40,
        padding: '4px 13px',
        borderRadius: 999,
        background: 'rgba(8, 24, 43, 0.72)',
        border: '1px solid rgba(255, 255, 255, 0.24)',
        boxShadow: '0 12px 28px rgba(7, 19, 33, 0.2)',
        backdropFilter: 'blur(14px)',
        color: 'rgba(255, 255, 255, 0.88)',
        fontSize: 11,
        fontWeight: 900,
        letterSpacing: 0,
        lineHeight: 1,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        style={{
          width: 13,
          height: 13,
          margin: 0,
          accentColor: '#22cc66',
        }}
      />
      Хитбоксы
    </label>
  );
}

function TrainingPerspectiveRink(): JSX.Element {
  return (
    <div
      role="img"
      aria-label="Новая тренировочная площадка"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'hidden',
        background: '#dceaf5',
      }}
    >
      <img
        src={TRAINING_NEW_COURT_BACKGROUND}
        alt=""
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: `calc(100% + ${TRAINING_NEW_COURT_BG_CROP_BOTTOM})`,
          objectFit: 'cover',
        }}
      />
    </div>
  );
}

function TrainingPlayView({ onBack }: { onBack: () => void }): JSX.Element | null {
  const data = useTrainingSessionStore((s) => s.data);
  const optimisticAddShot = useTrainingSessionStore((s) => s.optimisticAddShot);
  const submitShot = useTrainingSessionStore((s) => s.submitShot);
  const applyState = useTrainingSessionStore((s) => s.applyState);
  const userRole = useAuthStore((s) => s.user?.role);
  const experimentalTrainingCourt = useAuthStore((s) => s.user?.experimentalTrainingCourt);
  const [courtDesign, setCourtDesign] = useState<TrainingCourtDesign>(() =>
    readTrainingCourtDesign(),
  );
  const [hitboxesVisible, setHitboxesVisible] = useState(() => readTrainingHitboxesVisible());
  const canSwitchCourtDesign = userRole === 'admin' || experimentalTrainingCourt === true;
  const activeCourtDesign = canSwitchCourtDesign ? courtDesign : 'standard';
  const useNewCourt = activeCourtDesign === 'new';
  const handleCourtDesignChange = useCallback((next: TrainingCourtDesign): void => {
    setCourtDesign(next);
    saveTrainingCourtDesign(next);
  }, []);
  const handleHitboxesChange = useCallback((next: boolean): void => {
    setHitboxesVisible(next);
    saveTrainingHitboxesVisible(next);
  }, []);

  if (!data) return null;

  return (
    <>
      {canSwitchCourtDesign ? (
        <TrainingCourtDesignSwitch value={courtDesign} onChange={handleCourtDesignChange} />
      ) : null}
      {canSwitchCourtDesign && useNewCourt ? (
        <TrainingHitboxesToggle checked={hitboxesVisible} onChange={handleHitboxesChange} />
      ) : null}
      <PlayView<TrainingStateResponse>
        key={activeCourtDesign}
        suppressedByModal={false}
        showIceCar={false}
        onBack={onBack}
        active={data.state === 'active'}
        seed={data.training_seed}
        goalieId={data.goalie_id}
        periodNumber={data.selected_period ?? 1}
        periodSpeedPresets={data.period_speed_presets}
        sessionStartedAt={data.started_at}
        serverNow={data.server_now}
        receivedAtPerformanceMs={data.received_at_performance_ms}
        goals={data.goals}
        shots={data.shots_taken}
        shotsTotal={data.shots_limit}
        timer={String(data.shots_limit)}
        timerLabel="ЛИМИТ"
        backLabel="К тренировке"
        playerOptions={
          useNewCourt
            ? {
                spriteUrl: '/sprites/test-hockey-player.webp',
                spriteWidth: 112,
                spriteAspect: 941 / 1062,
                baseRotation: 0,
                shotMaxRotation: 0.24,
                visualYScale: TRAINING_NEW_COURT_VISUAL_Y_SCALE,
                visualYOffset: TRAINING_NEW_COURT_VISUAL_Y_OFFSET,
                shadow: true,
              }
            : undefined
        }
        goalOptions={
          useNewCourt
            ? {
                spriteUrl: '/sprites/test-goal-clean.webp',
                gateWidth: 102,
                gateAspect: 1097 / 734,
                visualYScale: TRAINING_NEW_COURT_VISUAL_Y_SCALE,
                visualYOffset: TRAINING_NEW_COURT_GOAL_VISUAL_Y_OFFSET,
                visualOffsetXScale: TRAINING_NEW_COURT_GOAL_VISUAL_OFFSET_X_SCALE,
                spriteAnchorY: 1,
              }
            : undefined
        }
        goalieOptions={
          useNewCourt
            ? {
                idleSpriteUrl: '/sprites/test-goalie-black.webp',
                saveSpriteUrl: '/sprites/test-goalie-black-save.webp',
                visualYScale: TRAINING_NEW_COURT_VISUAL_Y_SCALE,
                visualYOffset: TRAINING_NEW_COURT_GOALIE_VISUAL_Y_OFFSET,
                visualXScale: TRAINING_NEW_COURT_GOALIE_VISUAL_X_SCALE,
                sizeScale: 1.26,
                idleSizeScale: 1.22,
                saveSizeScale: 0.96,
                saveVisualYOffset: 10,
                shadow: true,
              }
            : undefined
        }
        puckOptions={
          useNewCourt
            ? {
                radiusScaleX: 1.16,
                radiusScaleY: 0.82,
                rotation: 0,
                visualYScale: TRAINING_NEW_COURT_VISUAL_Y_SCALE,
                visualYOffset: TRAINING_NEW_COURT_VISUAL_Y_OFFSET,
                bladeOffsetX: TRAINING_NEW_COURT_PUCK_BLADE_OFFSET_X,
                bladeOffsetY: TRAINING_NEW_COURT_PUCK_BLADE_OFFSET_Y,
                flightVisualYOffset: TRAINING_NEW_COURT_PUCK_FLIGHT_VISUAL_Y_OFFSET,
              }
            : undefined
        }
        optimisticAddShot={optimisticAddShot}
        submitShot={submitShot}
        applyState={applyState}
        rinkAspectRatio={useNewCourt ? '1024 / 1428' : undefined}
        rinkBorderRadius={useNewCourt ? 36 : undefined}
        rinkLayer={useNewCourt ? <TrainingPerspectiveRink /> : undefined}
        hitboxesVisible={useNewCourt && hitboxesVisible}
        hitboxesOptions={
          useNewCourt
            ? {
                goalWidthScale: TRAINING_NEW_COURT_HITBOX_GOAL_WIDTH_SCALE,
                goalHeightScale: TRAINING_NEW_COURT_HITBOX_GOAL_HEIGHT_SCALE,
                goalInset: TRAINING_NEW_COURT_HITBOX_GOAL_INSET,
                goalieWidthScale: TRAINING_NEW_COURT_HITBOX_GOALIE_WIDTH_SCALE,
                goalieHeightScale: TRAINING_NEW_COURT_HITBOX_GOALIE_HEIGHT_SCALE,
                goalieInset: TRAINING_NEW_COURT_HITBOX_GOALIE_INSET,
              }
            : undefined
        }
        shotResolver={useNewCourt ? resolveNewTrainingCourtShot : undefined}
      />
    </>
  );
}

export function DemoScreen(): JSX.Element {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? '';
  const [demoState, setDemoState] = useState<DemoSessionState>(() => createDemoSessionState());
  const demoStateRef = useRef(demoState);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [vkError, setVkError] = useState<string | null>(null);
  const [vkPending, setVkPending] = useState(false);
  demoStateRef.current = demoState;

  const telegramMutation = useMutation<AuthSession, Error, TelegramAuthPayload>({
    mutationFn: (payload) =>
      apiFetch<AuthSession>('/auth/telegram', {
        method: 'POST',
        body: JSON.stringify({ ...payload, timezone: detectTimezone() }),
      }),
    onSuccess: (session) => {
      setSession(session);
      navigate('/', { replace: true });
    },
  });

  const submitDemoShot = useCallback(
    async ({
      claimedResult,
    }: {
      shotIndex: number;
      input: ShotInputPayload;
      claimedResult: ShotResultType;
    }): Promise<{ serverResult: ShotResultType; state: DemoSessionState }> => {
      const next = advanceDemoSessionShot(demoStateRef.current, claimedResult);
      demoStateRef.current = next;
      return { serverResult: claimedResult, state: next };
    },
    [],
  );

  const applyDemoState = useCallback((next: DemoSessionState): void => {
    demoStateRef.current = next;
    setDemoState(next);
    if (next.status === 'finished') setCompletionOpen(true);
  }, []);

  const handleVkLogin = useCallback(async (): Promise<void> => {
    setVkError(null);
    setVkPending(true);
    try {
      await startVkOAuth();
    } catch (err) {
      setVkPending(false);
      setVkError(err instanceof Error ? err.message : 'Ошибка входа через ВКонтакте');
    }
  }, []);

  return (
    <>
      <PlayView<DemoSessionState>
        suppressedByModal={completionOpen}
        showIceCar={completionOpen}
        onBack={() => navigate('/login', { replace: true })}
        active={demoState.status === 'active'}
        seed={demoState.seed}
        goalieId={DEMO_GOALIE_ID}
        periodNumber={DEMO_PERIOD_NUMBER}
        periodsTotal={DEMO_TOTAL_PERIODS}
        goals={demoState.goals}
        shots={demoState.shotsTaken}
        shotsTotal={DEMO_SHOTS_PER_PERIOD}
        timer="ДЕМО"
        timerLabel="РЕЖИМ"
        backLabel="На вход"
        optimisticAddShot={() => {}}
        submitShot={submitDemoShot}
        applyState={applyDemoState}
      />

      {completionOpen && (
        <DemoCompletionModal
          goals={demoState.goals}
          shots={demoState.shotsTaken}
          botUsername={botUsername}
          telegramPending={telegramMutation.isPending}
          telegramError={telegramMutation.error}
          vkPending={vkPending}
          vkError={vkError}
          onTelegramAuth={(payload) => telegramMutation.mutate(payload)}
          onVkLogin={() => void handleVkLogin()}
        />
      )}
    </>
  );
}

function DemoCompletionModal({
  goals,
  shots,
  botUsername,
  telegramPending,
  telegramError,
  vkPending,
  vkError,
  onTelegramAuth,
  onVkLogin,
}: {
  goals: number;
  shots: number;
  botUsername: string;
  telegramPending: boolean;
  telegramError: Error | null;
  vkPending: boolean;
  vkError: string | null;
  onTelegramAuth: (payload: TelegramAuthPayload) => void;
  onVkLogin: () => void;
}): JSX.Element {
  const goalRate = formatGoalRate(goals, shots);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Демо завершено"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 430,
        background: 'rgba(15, 23, 42, 0.22)',
        backdropFilter: 'blur(8px) saturate(130%)',
        WebkitBackdropFilter: 'blur(8px) saturate(130%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 368,
          padding: '26px 22px 20px',
          borderRadius: 28,
          textAlign: 'center',
          background:
            'linear-gradient(180deg, rgba(255, 255, 255, 0.92) 0%, rgba(241, 245, 249, 0.9) 100%)',
          backdropFilter: 'blur(22px) saturate(160%)',
          WebkitBackdropFilter: 'blur(22px) saturate(160%)',
          border: '1px solid rgba(255, 255, 255, 0.68)',
          boxShadow:
            '0 30px 80px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(15, 23, 42, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
        }}
      >
        <div style={{ fontSize: 25, fontWeight: 900, letterSpacing: 0 }}>Первый период сыгран</div>
        <div
          style={{
            marginTop: 10,
            color: 'var(--muted)',
            fontSize: 14,
            lineHeight: 1.45,
            fontWeight: 700,
          }}
        >
          Необходимо войти, чтобы играть сезон, сохранять прогресс и открывать новые режимы игры
        </div>

        <div
          style={{
            marginTop: 18,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 8,
          }}
        >
          <TotalCell label="БРОСКИ" value={`${shots}/${DEMO_SHOTS_PER_PERIOD}`} />
          <TotalCell label="ГОЛЫ" value={String(goals)} />
          <TotalCell label="ТОЧНОСТЬ" value={goalRate} />
        </div>

        <div
          style={{
            marginTop: 20,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <button
            type="button"
            className="btn"
            disabled={vkPending}
            onClick={onVkLogin}
            style={{
              width: 242,
              height: 42,
              padding: '0 14px',
              borderRadius: 12,
              background: '#0077ff',
              color: '#ffffff',
              justifyContent: 'center',
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: 0,
              boxShadow: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Войти через ВКонтакте
          </button>

          <TelegramLoginButton
            botUsername={botUsername}
            onAuth={onTelegramAuth}
            cornerRadius={12}
            size="large"
          />

          {(telegramPending || telegramError || vkError) && (
            <div
              role="alert"
              style={{
                minHeight: 18,
                color: telegramError || vkError ? 'var(--red-deep)' : 'var(--muted)',
                fontSize: 13,
                fontWeight: 700,
                lineHeight: 1.35,
              }}
            >
              {telegramPending
                ? 'Проверяем профиль...'
                : telegramError
                  ? telegramError instanceof ApiError
                    ? telegramError.message
                    : 'Ошибка входа'
                  : vkError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PlayView<TState>({
  suppressedByModal,
  showIceCar,
  onBack,
  active,
  seed,
  goalieId,
  periodNumber,
  periodSpeedPresets,
  stickEffects = STICK_NEUTRAL,
  periodsTotal = 3,
  goals,
  shots,
  shotsTotal,
  timer,
  timerLabel,
  shotButtonLabel = 'БРОСОК',
  backLabel = 'К режимам',
  bottomInset = 'calc(76px + var(--app-safe-bottom))',
  sessionStartedAt,
  serverNow,
  receivedAtPerformanceMs,
  periodEndsAt,
  onTimerExpired,
  optimisticAddShot,
  submitShot,
  applyState,
  applyResolvedState,
  rinkLayer = <RinkSvg />,
  rinkAspectRatio = '572 / 700',
  rinkBorderRadius = 64,
  rinkBorder = '3px solid #1e3a5f',
  gameLayerStyle,
  playerGrip,
  playerOptions,
  goalOptions,
  goalieOptions,
  puckOptions,
  hitboxesVisible = false,
  hitboxesOptions,
  shotResolver,
  hudAddon,
  scoreboardOpponent,
}: PlayViewProps<TState>): JSX.Element {
  const session: PlaySessionSnapshot = useMemo(
    () => ({
      active,
      seed,
      goalieId,
      periodNumber,
      shots,
      shotsTotal,
    }),
    [active, seed, goalieId, periodNumber, shots, shotsTotal],
  );
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const sessionTimingRef = useRef<PlaySessionTiming>({
    sessionStartedAt: sessionStartedAt ?? null,
    serverNow: serverNow ?? null,
    receivedAtPerformanceMs: receivedAtPerformanceMs ?? null,
  });
  sessionTimingRef.current = {
    sessionStartedAt: sessionStartedAt ?? null,
    serverNow: serverNow ?? null,
    receivedAtPerformanceMs: receivedAtPerformanceMs ?? null,
  };

  const scaleRef = useRef<Scale>({ factor: 1, offsetX: 0, offsetY: 0 });
  const loopRef = useRef<GameLoop | null>(null);
  const puckRef = useRef<Puck | null>(null);
  const playerRef = useRef<Player | null>(null);
  const goalRef = useRef<Goal | null>(null);
  const goalieRef = useRef<Goalie | null>(null);
  const hitboxesRef = useRef<Hitboxes | null>(null);
  const refreshRef = useRef<((s: Scale) => void) | null>(null);
  const tickerRef = useRef<Ticker | null>(null);
  const entranceRafRef = useRef<number | null>(null);
  const iceCarRef = useRef<IceCar | null>(null);
  const iceCarRafRef = useRef<number | null>(null);
  const shotTimeoutsRef = useRef<number[]>([]);
  const mountedRef = useRef(true);
  const initializedRef = useRef(false);
  const [isShowingResult, setIsShowingResult] = useState(false);
  const [isShotInProgress, setIsShotInProgress] = useState(false);
  const [soundToastVisible, setSoundToastVisible] = useState(false);
  const soundToastTimerRef = useRef<number | null>(null);
  const [resultSubText, setResultSubText] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ShotResult | null>(null);
  // Server state is held until shot animation ends, so ScoreBoard counters
  // don't jump while the puck is still flying.
  const pendingMidShotApplyRef = useRef<(() => void) | null>(null);
  const [pixiReady, setPixiReady] = useState(false);
  // Ref-mirror of suppressedByModal so handleReady (initialized once via
  // useCallback) can read the latest value when Pixi finishes loading.
  const suppressedRef = useRef(suppressedByModal);
  suppressedRef.current = suppressedByModal;
  const showIceCarRef = useRef(showIceCar);
  showIceCarRef.current = showIceCar;
  const playerGripRef = useRef(playerGrip);
  playerGripRef.current = playerGrip;
  const playerOptionsRef = useRef(playerOptions);
  playerOptionsRef.current = playerOptions;
  const goalOptionsRef = useRef(goalOptions);
  goalOptionsRef.current = goalOptions;
  const goalieOptionsRef = useRef(goalieOptions);
  goalieOptionsRef.current = goalieOptions;
  const puckOptionsRef = useRef(puckOptions);
  puckOptionsRef.current = puckOptions;
  const hitboxesVisibleRef = useRef(hitboxesVisible);
  hitboxesVisibleRef.current = hitboxesVisible;
  const hitboxesOptionsRef = useRef(hitboxesOptions);
  hitboxesOptionsRef.current = hitboxesOptions;
  const shotResolverRef = useRef(shotResolver);
  shotResolverRef.current = shotResolver;

  const speeds = useMemo(
    () => speedOverridesForPeriod(periodNumber, periodSpeedPresets),
    [periodNumber, periodSpeedPresets],
  );
  const speedsRef = useRef<SpeedOverrides>(speeds);
  speedsRef.current = speeds;
  const stickEffectsRef = useRef<StickEffects>(stickEffects);
  stickEffectsRef.current = stickEffects;

  const flightDurationMs = useMemo(
    () => (PUCK_START.y - GOAL_OPENING.y) / speeds.puckSpeed,
    [speeds.puckSpeed],
  );

  const [now, setNow] = useState(Date.now());

  useEffect(
    () => () => {
      if (soundToastTimerRef.current !== null) {
        window.clearTimeout(soundToastTimerRef.current);
      }
    },
    [],
  );

  const showSoundToast = useCallback((): void => {
    setSoundToastVisible(true);
    if (soundToastTimerRef.current !== null) {
      window.clearTimeout(soundToastTimerRef.current);
    }
    soundToastTimerRef.current = window.setTimeout(() => {
      setSoundToastVisible(false);
      soundToastTimerRef.current = null;
    }, 1800);
  }, []);

  useEffect(() => {
    if (!periodEndsAt) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [periodEndsAt]);
  const remaining = periodEndsAt ? Math.max(0, periodEndsAt - now) : 0;

  useEffect(() => {
    hitboxesRef.current?.setVisible(hitboxesVisible);
  }, [hitboxesVisible]);

  useEffect(() => {
    if (remaining === 0 && periodEndsAt) void onTimerExpired?.();
  }, [remaining, periodEndsAt, onTimerExpired]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loopRef.current?.detach();
      if (entranceRafRef.current !== null) {
        cancelAnimationFrame(entranceRafRef.current);
        entranceRafRef.current = null;
      }
      if (iceCarRafRef.current !== null) {
        cancelAnimationFrame(iceCarRafRef.current);
        iceCarRafRef.current = null;
      }
      for (const id of shotTimeoutsRef.current) window.clearTimeout(id);
      shotTimeoutsRef.current = [];
      goalRef.current?.destroy();
      goalieRef.current?.destroy();
      playerRef.current?.destroy();
      puckRef.current?.destroy();
      hitboxesRef.current?.destroy();
      iceCarRef.current?.destroy();
      loopRef.current = null;
      tickerRef.current = null;
      refreshRef.current = null;
      goalRef.current = null;
      goalieRef.current = null;
      playerRef.current = null;
      puckRef.current = null;
      hitboxesRef.current = null;
      iceCarRef.current = null;
    };
  }, []);

  const handleReady = useCallback((app: Application, initialScale: Scale): void => {
    scaleRef.current = initialScale;

    const goal = new Goal(goalOptionsRef.current);
    const goalie = new Goalie(goalieOptionsRef.current);
    const goalOptions = goalOptionsRef.current;
    const goalieOptions = goalieOptionsRef.current;
    const hitboxes = new Hitboxes({
      goalVisualYScale: goalOptions?.visualYScale,
      goalVisualYOffset: goalOptions?.visualYOffset,
      goalVisualOffsetXScale: goalOptions?.visualOffsetXScale,
      goalWidthScale: hitboxesOptionsRef.current?.goalWidthScale,
      goalHeightScale: hitboxesOptionsRef.current?.goalHeightScale,
      goalInset: hitboxesOptionsRef.current?.goalInset,
      goalieVisualYScale: goalieOptions?.visualYScale,
      goalieVisualYOffset: goalieOptions?.visualYOffset,
      goalieVisualXScale: goalieOptions?.visualXScale,
      goalieVisualXCenter: goalieOptions?.visualXCenter,
      goalieVisualMinX: goalieOptions?.visualMinX,
      goalieVisualMaxX: goalieOptions?.visualMaxX,
      goalieWidthScale: hitboxesOptionsRef.current?.goalieWidthScale,
      goalieHeightScale: hitboxesOptionsRef.current?.goalieHeightScale,
      goalieInset: hitboxesOptionsRef.current?.goalieInset,
    });
    hitboxes.setVisible(hitboxesVisibleRef.current);
    const grip = playerGripRef.current ?? useAuthStore.getState().user?.grip ?? 'left';
    const puck = new Puck(grip, puckOptionsRef.current);
    const player = new Player(grip, playerOptionsRef.current);
    puckRef.current = puck;
    playerRef.current = player;
    goalRef.current = goal;
    goalieRef.current = goalie;
    hitboxesRef.current = hitboxes;

    const iceCar = new IceCar();
    iceCarRef.current = iceCar;

    const layer = new Container();
    layer.addChild(iceCar.container);
    layer.addChild(goal.container);
    layer.addChild(goalie.container);
    layer.addChild(player.container);
    layer.addChild(puck.container);
    layer.addChild(hitboxes.container);

    app.stage.addChild(layer);

    const refreshScale = (s: Scale): void => {
      scaleRef.current = s;
      goal.update(s);
      player.update(s);
      puck.resetAtStart(s);
    };
    refreshRef.current = refreshScale;
    refreshScale(initialScale);

    const loop = createGameLoop({
      goalRenderer: goal,
      goalieRenderer: goalie,
      playerRenderer: player,
      puckRenderer: puck,
      hitboxRenderer: hitboxes,
      getScale: () => scaleRef.current,
      getSeed: () => sessionRef.current.seed ?? 'fallback',
      getShotIndex: () => sessionRef.current.shots + 1,
      getGoalieId: () => sessionRef.current.goalieId,
      getSpeedOverrides: () => speedsRef.current,
      getInitialElapsedMs: () => computeInitialElapsedMs(sessionTimingRef.current),
    });
    tickerRef.current = app.ticker;
    loopRef.current = loop;

    // Decide initial visibility/loop state synchronously, BEFORE the first
    // ticker frame, so a modal-on-top mount never flashes moving sprites.
    if (suppressedRef.current) {
      player.container.visible = false;
      goalie.container.visible = false;
      puck.container.visible = false;
      goal.update(initialScale, 0);
      if (showIceCarRef.current) {
        startIceCarLoop(iceCarRef, iceCarRafRef, mountedRef, scaleRef);
      } else {
        iceCar.container.visible = false;
      }
    } else {
      iceCar.container.visible = false;
      loop.attach(app.ticker);
    }
    setPixiReady(true);
  }, []);

  // React to suppressedByModal flips after Pixi is up. handleReady applies
  // the initial state inline; this hook handles transitions only.
  useLayoutEffect(() => {
    if (!pixiReady) return;
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    const loop = loopRef.current;
    const goal = goalRef.current;
    const player = playerRef.current;
    const goalie = goalieRef.current;
    const puck = puckRef.current;
    const ticker = tickerRef.current;
    if (!loop || !goal || !player || !goalie || !puck || !ticker) return;
    if (suppressedByModal) {
      if (entranceRafRef.current !== null) {
        cancelAnimationFrame(entranceRafRef.current);
        entranceRafRef.current = null;
      }
      loop.detach();
      goal.update(scaleRef.current, 0);
      player.container.visible = false;
      goalie.container.visible = false;
      puck.container.visible = false;
      if (showIceCar) {
        startIceCarLoop(iceCarRef, iceCarRafRef, mountedRef, scaleRef);
      } else {
        stopIceCarLoop(iceCarRef, iceCarRafRef);
      }
      return;
    }

    stopIceCarLoop(iceCarRef, iceCarRafRef);

    // Modal closed → players skate out from center-ice area diagonally to
    // their spots. Goalie enters from above the red line, player from below,
    // so they never cross paths.
    const ENTRY_DURATION_MS = 1400;
    const CENTER_RED_Y = 350;
    const ENTRY_X = RINK.width + 50;
    const goalieStartX = ENTRY_X;
    const goalieStartY = CENTER_RED_Y - 30;
    const playerStartX = ENTRY_X;
    const playerStartY = CENTER_RED_Y + 30;
    const t0 = performance.now();
    player.container.visible = true;
    goalie.container.visible = true;
    puck.container.visible = false;
    const drawAt = (gx: number, gy: number, px: number, py: number): void => {
      player.update(scaleRef.current, px, py);
      goalie.update(
        {
          position: { x: gx, y: gy },
          width: GOALIE_SIZE.width,
          height: GOALIE_SIZE.height,
        },
        scaleRef.current,
      );
    };
    drawAt(goalieStartX, goalieStartY, playerStartX, playerStartY);
    const step = (): void => {
      if (!mountedRef.current) return;
      const t = Math.min(1, (performance.now() - t0) / ENTRY_DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      drawAt(
        goalieStartX + (SHOOTER_CENTER_X - goalieStartX) * eased,
        goalieStartY + (GOALIE_Y - goalieStartY) * eased,
        playerStartX + (SHOOTER_CENTER_X - playerStartX) * eased,
        playerStartY + (PUCK_START.y - playerStartY) * eased,
      );
      if (t < 1) {
        entranceRafRef.current = requestAnimationFrame(step);
      } else {
        entranceRafRef.current = null;
        puck.container.visible = true;
        // Reset before attach so goal/goalie pick up motion from t=0 instead
        // of a long-accumulated time that would snap them mid-cycle.
        loop.resetTime();
        loop.attach(ticker);
      }
    };
    entranceRafRef.current = requestAnimationFrame(step);
    return () => {
      if (entranceRafRef.current !== null) {
        cancelAnimationFrame(entranceRafRef.current);
        entranceRafRef.current = null;
      }
      if (iceCarRafRef.current !== null) {
        cancelAnimationFrame(iceCarRafRef.current);
        iceCarRafRef.current = null;
      }
    };
  }, [suppressedByModal, showIceCar, pixiReady]);

  const handleResize = useCallback((s: Scale): void => {
    refreshRef.current?.(s);
  }, []);

  const handleShotTap = useCallback((): void => {
    const loop = loopRef.current;
    const puck = puckRef.current;
    const goalie = goalieRef.current;
    const cur = sessionRef.current;
    if (!loop || !puck || !goalie) return;
    if (puck.isFlying() || puck.isHeld()) return;
    if (!cur.active) return;
    if (!cur.seed) return;
    if (typeof cur.shotsTotal === 'number' && cur.shots >= cur.shotsTotal) return;

    const shotIndex = cur.shots + 1;
    const goalieCfg = getGoalie(cur.goalieId);
    const overrides = speedsRef.current;
    // Apply the same frequency overrides that resolveShot uses internally, so
    // subText simulateGoal/simulateGoalie calls see the same goal/goalie
    // positions as the resolver did.
    const activeCfg = {
      ...goalieCfg,
      frequency: overrides.goalieFreq,
      goalFrequency: overrides.goalFreq,
    };
    const seed = deriveShotSeed(cur.seed, cur.periodNumber, shotIndex);
    const offsets = getSessionPhaseOffsets(cur.seed);

    const tapTime = loop.getSceneT();
    const shooterTapTime = loop.getShooterT();
    const sx = computeShooterX(shooterTapTime + offsets.shooter, overrides.shooterFreq);

    const input = {
      tapTime,
      shooterTapTime,
      puckSpeedPerMs: overrides.puckSpeed,
      shooterFrequency: overrides.shooterFreq,
      goalieFrequency: overrides.goalieFreq,
      goalFrequency: overrides.goalFreq,
    };
    const result: ShotResult =
      shotResolverRef.current?.({
        input,
        goalieConfig: activeCfg,
        seed,
        shotIndex,
        stickEffects: stickEffectsRef.current,
        phaseOffsets: offsets,
        shooterX: sx,
      }) ?? resolveShot(input, activeCfg, seed, shotIndex, stickEffectsRef.current, offsets);

    let subText: string | null = null;
    const flightMs = (PUCK_START.y - GOAL_OPENING.y) / overrides.puckSpeed;
    const tGoalCross = tapTime + flightMs;
    const tGoalieCross = tapTime + (PUCK_START.y - GOALIE_Y) / overrides.puckSpeed;
    if (result.type === 'save') {
      const gs = simulateGoalie(activeCfg, seed, shotIndex, tGoalieCross, offsets.goalie);
      const rel = sx - gs.position.x;
      const sixth = gs.width / 6;
      subText =
        rel < -sixth
          ? 'Уверенная игра блином'
          : rel > sixth
            ? 'Точно в ловушку!'
            : 'Вратарь на месте!';
    } else if (result.type === 'goal') {
      const goalOffsetAtCross = simulateGoal(activeCfg, tGoalCross, offsets.goal).offsetX;
      const oMin = GOAL_OPENING.xMin + goalOffsetAtCross;
      const oMax = GOAL_OPENING.xMax + goalOffsetAtCross;
      const rel = (sx - oMin) / (oMax - oMin);
      if (rel < 1 / 6 || rel > 5 / 6) subText = 'Точно в девятку!';
      else if (rel < 2 / 6 || rel > 4 / 6)
        subText = Math.random() < 0.5 ? 'Мощный щелчок!' : 'Отличный кистевой!';
      else subText = 'Отличный бросок!';
    } else if (result.type === 'miss') {
      const goalOffsetAtCross = simulateGoal(activeCfg, tGoalCross, offsets.goal).offsetX;
      const oMin = GOAL_OPENING.xMin + goalOffsetAtCross;
      const oMax = GOAL_OPENING.xMax + goalOffsetAtCross;
      const dist = Math.max(oMin - sx, sx - oMax, 0);
      subText =
        dist <= 3
          ? 'Штанга спасает!'
          : dist < 18
            ? 'Рядом со штангой!'
            : dist < 48
              ? 'Но было опасно!'
              : 'Очень далеко...';
    }

    optimisticAddShot(result.type);
    setIsShotInProgress(true);
    pendingMidShotApplyRef.current = null;

    loop.beginShooterPause();
    playerRef.current?.playShot();
    puck.playShot(
      puck.bladePoint(sx),
      { x: sx, y: GOAL_OPENING.y },
      performance.now(),
      flightDurationMs,
    );

    const scheduleShotTimeout = (fn: () => void, delay: number): void => {
      const id = window.setTimeout(() => {
        shotTimeoutsRef.current = shotTimeoutsRef.current.filter((timeoutId) => timeoutId !== id);
        if (!mountedRef.current) return;
        fn();
      }, delay);
      shotTimeoutsRef.current.push(id);
    };

    scheduleShotTimeout(() => {
      loop.beginScenePause();
      puck.holdAt({ x: sx, y: result.type === 'save' ? GOAL_OPENING.y + 20 : GOAL_OPENING.y });
      if (result.type === 'save') goalie.setSavePose(true);
      if (result.type === 'goal') goalRef.current?.triggerGoalLight();
      setLastResult(result);
      setResultSubText(subText);
      setIsShowingResult(true);
    }, flightDurationMs);

    scheduleShotTimeout(() => {
      loop.endScenePause();
      loop.endShooterPause();
      puck.release();
      if (result.type === 'save') goalie.setSavePose(false);
      setIsShowingResult(false);
      setIsShotInProgress(false);
      const applyPending = pendingMidShotApplyRef.current;
      if (applyPending) {
        applyPending();
        pendingMidShotApplyRef.current = null;
      }
    }, flightDurationMs + PAUSE_MS);

    void submitShot({
      shotIndex,
      input,
      claimedResult: result.type,
    }).then((res) => {
      if (!mountedRef.current) return;
      if (res === null) return;
      pendingMidShotApplyRef.current = () => (applyResolvedState ?? applyState)(res.state);
    });
  }, [flightDurationMs, optimisticAddShot, submitShot, applyState, applyResolvedState]);

  const timerValue = timer ?? formatMs(remaining);

  return (
    <main
      className="screen"
      style={{
        position: 'fixed',
        top: 'calc(var(--app-safe-top) + 6px)',
        left: 0,
        right: 0,
        bottom: bottomInset,
        minHeight: 0,
      }}
    >
      <div style={{ margin: '12px 14px 10px' }}>
        <ScoreBoard
          period={periodNumber}
          periodsTotal={periodsTotal}
          timer={timerValue}
          timerLabel={timerLabel}
          goals={goals}
          shots={shots}
          shotsTotal={shotsTotal}
          opponent={scoreboardOpponent}
        />
        {hudAddon}
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '0 14px 10px',
        }}
      >
        <div
          style={{
            position: 'relative',
            aspectRatio: rinkAspectRatio,
            width: '100%',
            maxHeight: '100%',
            borderRadius: rinkBorderRadius,
            overflow: 'hidden',
            border: rinkBorder,
            background: '#EAF1F8',
          }}
        >
          {rinkLayer}
          <div style={{ position: 'absolute', inset: 0, ...gameLayerStyle }}>
            <PixiStage onReady={handleReady} onResize={handleResize} />
          </div>
        </div>
      </div>

      <div
        style={{
          padding: '0 14px 10px',
          display: 'grid',
          gridTemplateColumns: '56px minmax(0, 1fr) 56px',
          gap: 10,
          alignItems: 'center',
          width: '100%',
          maxWidth: 344,
          margin: '0 auto',
        }}
      >
        <button
          type="button"
          aria-label={backLabel}
          title={backLabel}
          onClick={onBack}
          className="icon-btn icon-btn--dark"
          style={{
            width: 56,
            height: 56,
            borderRadius: 20,
          }}
        >
          <Home size={22} />
        </button>
        <button
          type="button"
          className="btn btn--cta"
          onClick={handleShotTap}
          disabled={
            suppressedByModal ||
            isShotInProgress ||
            isShowingResult ||
            !active ||
            (typeof shotsTotal === 'number' && shots >= shotsTotal)
          }
          style={{
            width: '100%',
            minHeight: 58,
            padding: '0 22px',
            letterSpacing: '0.12em',
            fontSize: 16,
          }}
        >
          {shotButtonLabel}
        </button>
        <button
          type="button"
          aria-label="Звук в разработке"
          title="Звук в разработке"
          onClick={showSoundToast}
          className="icon-btn"
          style={{
            width: 56,
            height: 56,
            borderRadius: 20,
            background: 'rgba(15, 23, 42, 0.1)',
            color: 'var(--muted)',
            border: '1px solid rgba(15, 23, 42, 0.08)',
            opacity: 0.72,
          }}
        >
          <VolumeX size={22} />
        </button>
      </div>

      {soundToastVisible && (
        <>
          <style>{`
            @keyframes game-toast-in {
              from { opacity: 0; transform: translate(-50%, 8px); }
              to   { opacity: 1; transform: translate(-50%, 0); }
            }
          `}</style>
          <div
            role="status"
            aria-live="polite"
            style={{
              position: 'fixed',
              left: '50%',
              bottom: 'calc(148px + var(--app-safe-bottom))',
              transform: 'translateX(-50%)',
              padding: '10px 16px',
              borderRadius: 999,
              background: 'rgba(15, 23, 42, 0.92)',
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 700,
              boxShadow: '0 14px 34px rgba(15, 23, 42, 0.34)',
              zIndex: 520,
              pointerEvents: 'none',
              animation: 'game-toast-in 180ms ease-out',
              whiteSpace: 'nowrap',
              maxWidth: 'calc(100vw - 32px)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            Звук в разработке
          </div>
        </>
      )}

      {isShowingResult && lastResult && (
        <ResultModal result={lastResult} durationMs={PAUSE_MS} subText={resultSubText} />
      )}
    </main>
  );
}
