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
import {
  ArrowLeft,
  BarChart3,
  ChevronRight,
  Home,
  Info,
  Search,
  Swords,
  VolumeX,
  X,
} from 'lucide-react';
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
  TRAINING_NEW_COURT_POST_EDGE_DISTANCE,
  distanceToNewTrainingCourtGoalEdge,
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
import { ResultModal, type ResultModalKind } from '../components/ResultModal.js';
import { GlassSelect } from '../components/GlassSelect.js';
import { UserAvatar } from '../chat/components/UserAvatar.js';
import { UserProfileSheet } from '../chat/components/UserProfileSheet.js';
import type { UserPickerItem } from '../chat/api.js';
import type {
  DailyGameStats,
  DailyStateResponse,
  PeriodLogEntry,
  ShotInputPayload,
  ShotResultType,
} from '../api/duel.js';
import type { TrainingStateResponse } from '../api/training.js';
import {
  challengeAmateurDuel,
  acceptAmateurDuel,
  cancelAmateurDuel,
  fetchAmateurEvents,
  fetchAmateurMatch,
  fetchAmateurMatches,
  fetchAmateurRating,
  fetchAmateurTemplates,
  joinAmateurMatchmaking,
  leaveAmateurMatchmaking,
  readyAmateurDuel,
  searchAmateurOpponents,
  settleAmateurDuel,
  startAmateurDuelPeriod,
  type AmateurDuelKind,
  type AmateurDuelMatch,
  type AmateurDuelMatchState,
  type AmateurDuelPeriodLog,
  type AmateurDuelPeriodRule,
  type AmateurDuelTemplate,
  type AmateurOpponent,
} from '../api/amateurDuel.js';
import { StartPeriodModal } from '../components/StartPeriodModal.js';
import { getLastSeenAt, setLastSeenAt } from '../stores/seenPeriods.js';

const PAUSE_MS = 1000;
const HUB_PERIOD_DURATION_MS = 20 * 60 * 1000;
const MODE_ARTWORK_SIZE = 104;

type GameLevel = 'beginner' | 'amateur' | 'pro';
type BeginnerMode = 'daily' | 'training';
type DailyView = 'arena' | 'play';
type AmateurView = 'home' | 'duels' | 'tournaments';
type AmateurDuelTab = 'game' | 'locker' | 'rating' | 'history';
type DuelHistoryScope = 'current' | 'all';
type LevelArtwork = 'beginner' | 'amateur' | 'pro';
type DailyHubArtwork = 'period-1' | 'period-2' | 'period-3' | 'break' | 'finished' | 'start';
type ModeInfoModalContent = { title: string; text: string };
type ArenaEntryKind = 'daily' | 'training' | 'duel';
interface ArenaEntry {
  id: string;
  kind: ArenaEntryKind;
  eyebrow: string;
  title: string;
  subtitle: string;
  meta: string;
  ctaLabel: string;
  artworkSrc: string;
  disabled?: boolean;
  scoreboard?: JSX.Element;
  opponentName?: string;
  opponentAvatarUrl?: string | null;
  typeLabel?: string;
  onEnter: () => void;
}
export type PlayShotResolver = (context: {
  input: ShotInput;
  goalieConfig: GoalieConfig;
  seed: string;
  shotIndex: number;
  stickEffects: StickEffects;
  phaseOffsets: SessionPhaseOffsets;
  shooterX: number;
}) => ShotResult;
type RouteCameraPhase = 'settled' | 'zoomed' | 'exiting';

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
const TRAINING_HITBOX_TOGGLE_STORAGE_KEY = 'hockey.trainingHitboxesVisible';
const OPPONENT_ONLINE_WINDOW_MS = 2 * 60 * 1000;
const OPPONENT_RECENT_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_AMATEUR_UNLOCK_GOALS_REQUIRED = 1000;
const ARENA_LAUNCH_TRANSITION_MS = 640;
const PLAY_ROUTE_TRANSITION_MS = 580;
const ARENA_SELECTED_ENTRY_STORAGE_KEY = 'hockey.arenaSelectedEntryId';
const ARENA_RETURN_FRAME_STORAGE_KEY = 'hockey.arenaReturnFrame';

interface ArenaReturnFrame {
  left: number;
  top: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  savedAt: number;
}

function readArenaSelectedEntryId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(ARENA_SELECTED_ENTRY_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveArenaSelectedEntryId(value: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.localStorage.setItem(ARENA_SELECTED_ENTRY_STORAGE_KEY, value);
    else window.localStorage.removeItem(ARENA_SELECTED_ENTRY_STORAGE_KEY);
  } catch {
    // The arena selection is just a UI convenience; storage failure should not block navigation.
  }
}

function readArenaReturnFrame(): ArenaReturnFrame | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(ARENA_RETURN_FRAME_STORAGE_KEY);
    window.sessionStorage.removeItem(ARENA_RETURN_FRAME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ArenaReturnFrame>;
    const frame: ArenaReturnFrame = {
      left: Number(parsed.left),
      top: Number(parsed.top),
      width: Number(parsed.width),
      height: Number(parsed.height),
      viewportWidth: Number(parsed.viewportWidth),
      viewportHeight: Number(parsed.viewportHeight),
      savedAt: Number(parsed.savedAt),
    };
    const isValid =
      Number.isFinite(frame.left) &&
      Number.isFinite(frame.top) &&
      Number.isFinite(frame.width) &&
      Number.isFinite(frame.height) &&
      Number.isFinite(frame.viewportWidth) &&
      Number.isFinite(frame.viewportHeight) &&
      Number.isFinite(frame.savedAt) &&
      frame.width > 0 &&
      frame.height > 0 &&
      Math.abs(frame.viewportWidth - window.innerWidth) < 2 &&
      Math.abs(frame.viewportHeight - window.innerHeight) < 2 &&
      Date.now() - frame.savedAt < 5000;
    return isValid ? frame : null;
  } catch {
    return null;
  }
}

function saveArenaReturnFrame(rect: DOMRect): void {
  if (typeof window === 'undefined') return;
  try {
    const frame: ArenaReturnFrame = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      savedAt: Date.now(),
    };
    window.sessionStorage.setItem(ARENA_RETURN_FRAME_STORAGE_KEY, JSON.stringify(frame));
  } catch {
    // This is only for visual continuity between routes.
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

function shouldReduceMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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

function parseAspectRatio(value: string): number {
  const [widthRaw, heightRaw] = value.split('/');
  const width = Number(widthRaw?.trim());
  const height = Number(heightRaw?.trim());
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return RINK.width / RINK.height;
  }
  return width / height;
}

function outerBlockHeight(el: HTMLElement | null): number {
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return rect.height + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
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

type PlayOpenOptions = {
  entrance?: boolean;
  directPlay?: boolean;
  routeTransition?: boolean;
};

type PendingPlayMarker = 'daily' | 'training' | `duel:${string}` | null;

export function DailyScreen(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const data = useDailyStore((s) => s.data);
  const error = useDailyStore((s) => s.error);
  const loading = useDailyStore((s) => s.loading);
  const refresh = useDailyStore((s) => s.refresh);
  const routeParams = new URLSearchParams(location.search);
  const fromSections = routeParams.get('from') === 'sections';
  const [selectedLevel, setSelectedLevel] = useState<GameLevel>('beginner');
  const [activeAmateurMatchId, setActiveAmateurMatchId] = useState<string | null>(null);
  const [amateurView, setAmateurView] = useState<AmateurView>('home');
  const [beginnerMode, setBeginnerMode] = useState<BeginnerMode>(() => {
    const view = new URLSearchParams(location.search).get('view');
    return view === 'training' ? 'training' : 'daily';
  });
  const [dailyView, setDailyView] = useState<DailyView>(() => {
    const view = new URLSearchParams(location.search).get('view');
    return view === 'daily' ? 'play' : 'arena';
  });
  const [pendingPlayEntrance, setPendingPlayEntrance] = useState<PendingPlayMarker>(null);
  const [pendingPlayRouteTransition, setPendingPlayRouteTransition] =
    useState<PendingPlayMarker>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const view = params.get('view');
    if (view === null || view === 'arena' || view === 'hub') {
      setDailyView('arena');
      setSelectedLevel('beginner');
      setBeginnerMode('daily');
    }
    if (view === 'daily') {
      setDailyView('play');
      setSelectedLevel('beginner');
      setBeginnerMode('daily');
    }
    if (view === 'training') {
      setDailyView('arena');
      setSelectedLevel('beginner');
      setBeginnerMode('training');
    }
    if (view === 'amateur') {
      const matchId = params.get('match');
      const section = params.get('section');
      setDailyView('arena');
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
    if (view === 'pro') {
      setDailyView('arena');
      setSelectedLevel('pro');
      setBeginnerMode('daily');
      setActiveAmateurMatchId(null);
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
    setPendingPlayEntrance(null);
    setPendingPlayRouteTransition(null);
    setDailyView('arena');
    setSelectedLevel('beginner');
    setBeginnerMode('daily');
    navigate('/?view=arena', { replace: true });
  };

  const openSections = (): void => {
    setPendingPlayEntrance(null);
    setPendingPlayRouteTransition(null);
    setDailyView('arena');
    setSelectedLevel('beginner');
    setBeginnerMode('daily');
    setActiveAmateurMatchId(null);
    setAmateurView('home');
    navigate('/sections', { replace: true });
  };

  const openDailyPlay = (options?: PlayOpenOptions): void => {
    setPendingPlayEntrance(options?.entrance ? 'daily' : null);
    setPendingPlayRouteTransition(options?.routeTransition || options?.entrance ? 'daily' : null);
    setDailyView('play');
    setSelectedLevel('beginner');
    setBeginnerMode('daily');
    navigate('/?view=daily', { replace: true });
  };

  const openTraining = (): void => {
    setPendingPlayEntrance(null);
    setPendingPlayRouteTransition(null);
    setDailyView('arena');
    setSelectedLevel('beginner');
    setBeginnerMode('training');
    navigate('/?view=training', { replace: true });
  };

  const openTrainingPlay = (options?: PlayOpenOptions): void => {
    setPendingPlayEntrance(options?.entrance ? 'training' : null);
    setPendingPlayRouteTransition(
      options?.routeTransition || options?.entrance ? 'training' : null,
    );
    setDailyView('arena');
    setSelectedLevel('beginner');
    setBeginnerMode('training');
    navigate('/?view=training&play=1', { replace: true });
  };

  if (selectedLevel === 'beginner' && beginnerMode === 'daily' && dailyView === 'play') {
    return (
      <DailyPlayView
        onBack={openHub}
        playEntranceOnMount={pendingPlayEntrance === 'daily'}
        onEntranceConsumed={() => setPendingPlayEntrance(null)}
        playRouteTransitionOnMount={pendingPlayRouteTransition === 'daily'}
        onRouteTransitionConsumed={() => setPendingPlayRouteTransition(null)}
      />
    );
  }

  if (selectedLevel !== 'beginner') {
    if (selectedLevel === 'amateur') {
      if (activeAmateurMatchId) {
        const directDuelPlay = routeParams.get('play') === '1';
        return (
          <AmateurDuelPlayView
            matchId={activeAmateurMatchId}
            directPlayOnly={directDuelPlay}
            playEntranceOnMount={pendingPlayEntrance === `duel:${activeAmateurMatchId}`}
            onEntranceConsumed={() => setPendingPlayEntrance(null)}
            playRouteTransitionOnMount={
              pendingPlayRouteTransition === `duel:${activeAmateurMatchId}`
            }
            onRouteTransitionConsumed={() => setPendingPlayRouteTransition(null)}
            onBack={() => {
              setPendingPlayEntrance(null);
              setPendingPlayRouteTransition(null);
              setActiveAmateurMatchId(null);
              if (directDuelPlay) {
                setSelectedLevel('beginner');
                setBeginnerMode('daily');
                setDailyView('arena');
                navigate('/?view=arena', { replace: true });
                return;
              }
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
              navigate(fromSections ? '/?view=amateur&from=sections' : '/?view=amateur', {
                replace: true,
              });
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
              navigate(fromSections ? '/?view=amateur&from=sections' : '/?view=amateur', {
                replace: true,
              });
            }}
          />
        );
      }
      return (
        <AmateurHub
          onBack={() => {
            if (fromSections) {
              openSections();
              return;
            }
            setSelectedLevel('beginner');
            setBeginnerMode('daily');
            setAmateurView('home');
            navigate('/?view=arena', { replace: true });
          }}
          onOpenDuels={() => {
            setAmateurView('duels');
            navigate(
              fromSections
                ? '/?view=amateur&section=duels&from=sections'
                : '/?view=amateur&section=duels',
              { replace: true },
            );
          }}
          onOpenTournaments={() => {
            setAmateurView('tournaments');
            navigate(
              fromSections
                ? '/?view=amateur&section=tournaments&from=sections'
                : '/?view=amateur&section=tournaments',
              { replace: true },
            );
          }}
        />
      );
    }
    return (
      <LevelPlaceholder
        level={selectedLevel}
        onBack={() => {
          if (fromSections) {
            openSections();
            return;
          }
          setSelectedLevel('beginner');
          setBeginnerMode('daily');
        }}
      />
    );
  }

  if (beginnerMode === 'training') {
    return (
      <TrainingPlaceholder
        autoPlay={routeParams.get('play') === '1'}
        onBack={fromSections ? openSections : openHub}
        onPlayHome={openHub}
        playEntranceOnStart={pendingPlayEntrance === 'training'}
        onEntranceConsumed={() => setPendingPlayEntrance(null)}
        playRouteTransitionOnStart={pendingPlayRouteTransition === 'training'}
        onRouteTransitionConsumed={() => setPendingPlayRouteTransition(null)}
        onPlayStart={() => {
          navigate('/?view=training&play=1', { replace: true });
        }}
      />
    );
  }

  return (
    <GameHub
      onOpenDailyPlay={openDailyPlay}
      onOpenTraining={openTraining}
      onOpenTrainingPlay={openTrainingPlay}
      onOpenAmateurMatch={(matchId, options) => {
        setPendingPlayEntrance(options?.entrance ? `duel:${matchId}` : null);
        setPendingPlayRouteTransition(
          options?.routeTransition || options?.entrance ? `duel:${matchId}` : null,
        );
        setSelectedLevel('amateur');
        setBeginnerMode('daily');
        setDailyView('arena');
        setAmateurView('duels');
        setActiveAmateurMatchId(matchId);
        navigate(
          `/?view=amateur&match=${encodeURIComponent(matchId)}${options?.directPlay ? '&play=1' : ''}`,
          { replace: true },
        );
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
              width: '100%',
              boxSizing: 'border-box',
              minWidth: 0,
              minHeight: 34,
              borderRadius: 999,
              border: active ? '1px solid rgba(15, 23, 42, 0.92)' : '1px solid transparent',
              background: active ? 'rgba(15, 23, 42, 0.92)' : 'transparent',
              color: active ? '#ffffff' : 'var(--ink)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 800,
              lineHeight: 1,
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
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
  onOpenTrainingPlay,
  onOpenAmateurMatch,
}: {
  onOpenDailyPlay: (options?: PlayOpenOptions) => void;
  onOpenTraining: () => void;
  onOpenTrainingPlay: (options?: PlayOpenOptions) => void;
  onOpenAmateurMatch: (matchId: string, options?: PlayOpenOptions) => void;
}): JSX.Element {
  const data = useDailyStore((s) => s.data)!;
  const refresh = useDailyStore((s) => s.refresh);
  const startDailyPeriod = useDailyStore((s) => s.startPeriod);
  const trainingData = useTrainingSessionStore((s) => s.data);
  const startTraining = useTrainingSessionStore((s) => s.start);
  const trainingInFlight = useTrainingSessionStore((s) => s.inFlight);
  const [modeInfoModal, setModeInfoModal] = useState<ModeInfoModalContent | null>(null);
  const [dailyStatsOpen, setDailyStatsOpen] = useState(false);
  const [duelStatsMatch, setDuelStatsMatch] = useState<AmateurDuelMatch | null>(null);
  const [arenaActionId, setArenaActionId] = useState<string | null>(null);
  const [launchingArenaEntryId, setLaunchingArenaEntryId] = useState<string | null>(null);
  const [arenaReturnFrame] = useState<ArenaReturnFrame | null>(readArenaReturnFrame);
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
  const amateurUnlockGoalsRequired = Math.max(
    0,
    data.amateur_unlock_goals_required ?? DEFAULT_AMATEUR_UNLOCK_GOALS_REQUIRED,
  );
  const amateurEvents = useQuery({
    queryKey: ['amateur-duel', 'events'],
    queryFn: fetchAmateurEvents,
    enabled: data.lifetime_total_goals >= amateurUnlockGoalsRequired,
    refetchInterval: 30_000,
  });
  const amateurEventItems = amateurEvents.data?.events ?? [];
  const duelStatsCurrentMatch = duelStatsMatch
    ? (amateurEventItems.find((event) => event.id === duelStatsMatch.id) ?? duelStatsMatch)
    : null;
  const activeDuelEvents = amateurEventItems.filter(isArenaDuelEvent);
  const [activeCubeEntryId, setActiveCubeEntryId] = useState<string | null>(
    readArenaSelectedEntryId,
  );

  useEffect(() => {
    if (
      data.state !== 'period_active' &&
      data.state !== 'break_active' &&
      data.state !== 'closed' &&
      !isDailyLockedByTraining &&
      activeDuelEvents.length === 0
    ) {
      return undefined;
    }
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [activeDuelEvents.length, data.state, isDailyLockedByTraining]);

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

  const isDailyInProgress = data.state === 'period_active' || data.state === 'break_active';
  const isArenaLaunching = launchingArenaEntryId !== null;
  const dailyActionDisabled = pending || arenaActionId === 'daily' || isArenaLaunching;
  const dailyActionLabel = 'На площадку';
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
  const trainingShotsLimit = trainingData?.shots_limit ?? 500;
  const trainingShotsTaken = trainingData?.shots_taken ?? 0;
  const trainingAvailability = isTrainingLockedByDaily
    ? 'Закрыта до завершения игры'
    : `${trainingShotsTaken}/${trainingShotsLimit} бросков сегодня`;

  const runArenaLaunch = useCallback(
    async <T,>(
      _entryId: string,
      prepare: () => Promise<T>,
      enter: (value: T) => void | Promise<void>,
    ): Promise<void> => {
      void _entryId;
      try {
        const value = await prepare();
        await enter(value);
      } catch (err) {
        setLaunchingArenaEntryId(null);
        throw err;
      }
    },
    [],
  );

  const handleDailyAction = async (): Promise<void> => {
    if (pending || arenaActionId === 'daily' || isArenaLaunching) return;
    if (
      data.state === 'idle' &&
      data.current_period < data.total_periods &&
      !isDailyLockedByTraining
    ) {
      setArenaActionId('daily');
      try {
        await runArenaLaunch(
          'daily',
          () => startDailyPeriod(),
          (next) => {
            if (next?.state === 'period_active') {
              onOpenDailyPlay({ entrance: true, routeTransition: true });
            } else {
              setLaunchingArenaEntryId(null);
            }
          },
        );
      } finally {
        setArenaActionId(null);
      }
      return;
    }
    await runArenaLaunch(
      'daily',
      async () => null,
      () => onOpenDailyPlay({ routeTransition: true }),
    );
  };

  const handleOpenTraining = async (): Promise<void> => {
    if (trainingInFlight || arenaActionId === 'training' || isArenaLaunching) return;
    if (
      isTrainingLockedByDaily ||
      trainingData?.state === 'active' ||
      trainingData?.state === 'closed'
    ) {
      await runArenaLaunch(
        'training',
        async () => null,
        () => onOpenTrainingPlay({ routeTransition: true }),
      );
      return;
    }
    setArenaActionId('training');
    try {
      const periodNumber = trainingData?.selected_period ?? 1;
      await runArenaLaunch(
        'training',
        () => startTraining(periodNumber),
        (next) => {
          if (next?.state === 'active') {
            onOpenTrainingPlay({ entrance: true, routeTransition: true });
          } else {
            setLaunchingArenaEntryId(null);
            onOpenTraining();
          }
        },
      );
    } finally {
      setArenaActionId(null);
    }
  };

  const handleOpenDuel = async (event: AmateurDuelMatch): Promise<void> => {
    if (arenaActionId !== null || isArenaLaunching) return;
    setArenaActionId(`duel-${event.id}`);
    try {
      await runArenaLaunch(
        `duel-${event.id}`,
        async () => {
          let entrance = false;
          let latest: AmateurDuelMatch | AmateurDuelMatchState = event;

          if (latest.status === 'invited' && latest.me.state === 'invited') {
            latest = (await acceptAmateurDuel(latest.id)).match;
          }

          if (latest.status === 'ready_check' && latest.me.state !== 'ready') {
            latest = (await readyAmateurDuel(latest.id, {})).match;
          }

          const nowMs = duelMatchNowMs(latest, Date.now());
          if (canStartArenaDuelPeriod(latest, nowMs)) {
            latest = (await startAmateurDuelPeriod(latest.id)).match;
            entrance = true;
          }

          if (latest.me.state !== 'period_active') {
            return {
              matchId: latest.id,
              entrance: false,
              playable: false,
            };
          }

          return {
            matchId: latest.id,
            entrance,
            playable: true,
          };
        },
        ({ matchId, entrance, playable }) => {
          if (!playable) {
            onOpenAmateurMatch(matchId, {
              entrance: false,
              directPlay: true,
              routeTransition: true,
            });
            return;
          }
          onOpenAmateurMatch(matchId, { entrance, directPlay: true, routeTransition: true });
        },
      );
    } catch (err) {
      setModeInfoModal({
        title: 'Не удалось открыть дуэль',
        text: err instanceof Error ? err.message : 'Попробуйте ещё раз через пару секунд.',
      });
    } finally {
      setArenaActionId(null);
    }
  };

  const dailyArenaEntry: ArenaEntry = {
    id: 'daily',
    kind: 'daily',
    eyebrow: 'Ежедневная игра',
    title: dailyEventTitle,
    subtitle:
      data.state === 'closed'
        ? 'День завершён, следующий старт после обновления.'
        : isDailyLockedByTraining
          ? 'После тренировки нужно восстановиться.'
          : 'Главная игра дня на три периода.',
    meta:
      data.state === 'closed'
        ? 'Следующий старт после обновления.'
        : isDailyLockedByTraining
          ? 'Ежедневная игра временно недоступна.'
          : isDailyInProgress
            ? 'Игра уже начата.'
            : `${data.total_periods} периода по ${data.shots_per_period} бросков.`,
    ctaLabel: dailyActionLabel,
    artworkSrc: DAILY_HUB_ARTWORK_IMAGES[dailyHubArtwork],
    disabled: dailyActionDisabled,
    onEnter: () => void handleDailyAction(),
    scoreboard: (
      <DailyHubScoreboard
        activePeriod={dailyHubScoreboard.activePeriod}
        ariaLabel={dailyHubScoreboard.ariaLabel}
        periodsTotal={data.total_periods}
        timer={dailyHubScoreboard.timer}
        timerLabel={dailyHubScoreboard.timerLabel}
      />
    ),
  };
  const trainingArenaEntry: ArenaEntry = {
    id: 'training',
    kind: 'training',
    eyebrow: 'Тренировка',
    title: 'Тренировка',
    subtitle: 'Период на выбор, броски для формы и скорости.',
    meta: trainingAvailability,
    ctaLabel: 'На площадку',
    artworkSrc: MODE_ARTWORK_IMAGES.beginner ?? DAILY_HUB_ARTWORK_IMAGES.start,
    disabled: trainingInFlight || arenaActionId === 'training' || isArenaLaunching,
    onEnter: handleOpenTraining,
  };
  const duelArenaEntries = activeDuelEvents.map<ArenaEntry>((event) => {
    const timing = duelEventTiming(event, now);
    return {
      id: `duel-${event.id}`,
      kind: 'duel',
      eyebrow: 'Активная дуэль',
      title: event.opponent.display_name,
      subtitle: duelOutcomeText(event),
      meta: `${timing.label}: ${timing.value}`,
      ctaLabel: arenaDuelCtaLabel(event, now),
      artworkSrc: DUEL_EVENT_ARTWORK_IMAGE,
      disabled: arenaActionId === `duel-${event.id}` || isArenaLaunching,
      opponentName: event.opponent.display_name,
      opponentAvatarUrl: event.opponent.avatar_url,
      typeLabel: duelKindText(event.rules.duelKind),
      onEnter: () => void handleOpenDuel(event),
      scoreboard: (
        <DailyHubScoreboard
          activePeriod={timing.activePeriod}
          ariaLabel={`${duelOutcomeText(event)}. ${timing.ariaLabel}`}
          periodsTotal={event.rules.totalPeriods}
          timer={timing.value}
          timerLabel={timing.label}
        />
      ),
    };
  });
  const arenaEntries: ArenaEntry[] =
    duelArenaEntries.length > 0
      ? [...duelArenaEntries, dailyArenaEntry, trainingArenaEntry]
      : [dailyArenaEntry, trainingArenaEntry];

  const arenaEntryIds = arenaEntries.map((entry) => entry.id).join('|');
  const activeCubeIndex = Math.max(
    0,
    arenaEntries.findIndex((entry) => entry.id === activeCubeEntryId),
  );
  const activeCubeEntryExists =
    activeCubeEntryId === null || arenaEntries.some((entry) => entry.id === activeCubeEntryId);

  useEffect(() => {
    if (!activeCubeEntryId || activeCubeEntryExists) return;
    setActiveCubeEntryId(null);
    saveArenaSelectedEntryId(null);
  }, [activeCubeEntryId, activeCubeEntryExists, arenaEntryIds]);

  const handleArenaActiveIndexChange = useCallback(
    (index: number): void => {
      const entry = arenaEntries[index];
      if (!entry || entry.id === activeCubeEntryId) return;
      setActiveCubeEntryId(entry.id);
      saveArenaSelectedEntryId(entry.id);
    },
    [activeCubeEntryId, arenaEntries],
  );

  return (
    <main
      className="screen"
      style={{
        position: 'relative',
        padding: 'calc(18px + var(--app-safe-top)) 0 0',
        overflow: 'hidden',
      }}
    >
      <ArenaRinkBackdropLayer launching={isArenaLaunching} returnFrame={arenaReturnFrame} />

      <section
        aria-label="Игровая арена"
        style={{
          position: 'relative',
          zIndex: 2,
          width: '100%',
          maxWidth: 760,
          height: '100%',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 14,
          padding: '0 14px',
          paddingBottom: 'calc(92px + var(--bottom-nav-bottom-gap))',
        }}
      >
        <ArenaVideoCube
          entries={arenaEntries}
          activeIndex={activeCubeIndex}
          onActiveIndexChange={handleArenaActiveIndexChange}
          launchingEntryId={launchingArenaEntryId}
          onStats={(entry) => {
            if (entry.kind === 'daily') setDailyStatsOpen(true);
          }}
        />
      </section>

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

function ArenaRinkBackdropLayer({
  launching,
  returnFrame,
}: {
  launching: boolean;
  returnFrame: ArenaReturnFrame | null;
}): JSX.Element {
  const [activeReturnFrame, setActiveReturnFrame] = useState<ArenaReturnFrame | null>(returnFrame);
  const viewportWidth = typeof window === 'undefined' ? 390 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 844 : window.innerHeight;
  const arenaWidth = Math.max(viewportWidth * 1.12, (viewportHeight * 1024) / 1428);
  const arenaHeight = (arenaWidth * 1428) / 1024;
  const transition =
    `left ${ARENA_LAUNCH_TRANSITION_MS}ms cubic-bezier(.16,.84,.24,1), ` +
    `top ${ARENA_LAUNCH_TRANSITION_MS}ms cubic-bezier(.16,.84,.24,1), ` +
    `width ${ARENA_LAUNCH_TRANSITION_MS}ms cubic-bezier(.16,.84,.24,1), ` +
    `height ${ARENA_LAUNCH_TRANSITION_MS}ms cubic-bezier(.16,.84,.24,1), ` +
    `filter ${ARENA_LAUNCH_TRANSITION_MS}ms cubic-bezier(.16,.84,.24,1), ` +
    `transform ${ARENA_LAUNCH_TRANSITION_MS}ms cubic-bezier(.16,.84,.24,1), ` +
    `opacity ${ARENA_LAUNCH_TRANSITION_MS}ms ease`;

  useEffect(() => {
    if (!returnFrame) return undefined;

    setActiveReturnFrame(returnFrame);
    let secondFrame: number | null = null;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => setActiveReturnFrame(null));
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
    };
  }, [returnFrame]);

  const isReturning = activeReturnFrame !== null;
  const rinkFrameStyle: CSSProperties = activeReturnFrame
    ? {
        position: 'fixed',
        left: activeReturnFrame.left,
        top: activeReturnFrame.top,
        width: activeReturnFrame.width,
        height: activeReturnFrame.height,
        overflow: 'hidden',
        opacity: 0.96,
        filter: 'blur(0.7px) saturate(1.02) contrast(1)',
        transform: 'translate3d(0, 0, 0)',
        transformOrigin: '50% 58%',
        transition,
      }
    : {
        position: 'fixed',
        left: viewportWidth / 2,
        top: viewportHeight * (launching ? 0.53 : 0.5),
        width: arenaWidth,
        height: arenaHeight,
        overflow: 'hidden',
        opacity: launching ? 1 : 0.94,
        filter: launching
          ? 'blur(0.6px) saturate(1.02) contrast(1)'
          : 'blur(2.2px) saturate(0.96) contrast(0.98)',
        transform: launching
          ? 'translate3d(-50%, -50%, 0) scale(0.76)'
          : 'translate3d(-50%, -50%, 0) scale(1)',
        transformOrigin: '50% 54%',
        transition,
      };
  return (
    <div
      data-testid="arena-rink-backdrop"
      data-launching={launching ? 'true' : 'false'}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <div style={rinkFrameStyle}>
        <TrainingPerspectiveRink />
      </div>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(180,211,235,0.22) 0%, rgba(180,211,235,0.04) 28%, rgba(180,211,235,0.1) 100%), radial-gradient(circle at 50% 46%, rgba(255,255,255,0.14), transparent 38%)',
          opacity: launching ? 0.06 : isReturning ? 0.18 : 0.46,
          transition: `opacity ${ARENA_LAUNCH_TRANSITION_MS}ms ease`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 50% 50%, transparent 0 28%, rgba(15,23,42,0.18) 62%, rgba(15,23,42,0.28) 100%)',
          opacity: launching ? 0 : isReturning ? 0.12 : 0.22,
          transform: launching ? 'scale(1.08)' : 'scale(1)',
          transition: `opacity ${ARENA_LAUNCH_TRANSITION_MS}ms cubic-bezier(.16,.84,.24,1), transform ${ARENA_LAUNCH_TRANSITION_MS}ms cubic-bezier(.16,.84,.24,1)`,
        }}
      />
    </div>
  );
}

function getArenaCarouselStep(carousel: HTMLDivElement | null): number {
  if (!carousel) return 0;
  const firstCard = carousel.firstElementChild as HTMLElement | null;
  const styles = window.getComputedStyle(carousel);
  const gap = Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;
  return (firstCard?.offsetWidth ?? carousel.clientWidth ?? 0) + gap;
}

function ArenaVideoCube({
  entries,
  activeIndex,
  onActiveIndexChange,
  launchingEntryId,
  onStats,
}: {
  entries: ArenaEntry[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  launchingEntryId: string | null;
  onStats: (entry: ArenaEntry) => void;
}): JSX.Element {
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const activeIndexRef = useRef(activeIndex);
  const scrollCommitTimerRef = useRef<number | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const programmaticScrollRef = useRef(false);
  const [scrollProgress, setScrollProgress] = useState(activeIndex);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    return () => {
      if (scrollCommitTimerRef.current !== null) {
        window.clearTimeout(scrollCommitTimerRef.current);
      }
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    const carousel = carouselRef.current;
    const step = getArenaCarouselStep(carousel);
    if (!carousel || step <= 0) {
      setScrollProgress(activeIndex);
      return;
    }
    const nextLeft = activeIndex * step;
    const currentIndex = Math.round(carousel.scrollLeft / step);
    if (currentIndex !== activeIndex && Math.abs(carousel.scrollLeft - nextLeft) > 1) {
      programmaticScrollRef.current = true;
      if (typeof carousel.scrollTo === 'function') {
        carousel.scrollTo({ left: nextLeft, behavior: 'auto' });
      } else {
        carousel.scrollLeft = nextLeft;
      }
      window.requestAnimationFrame(() => {
        programmaticScrollRef.current = false;
      });
    }
    setScrollProgress(activeIndex);
  }, [activeIndex, entries.length]);

  const handleScroll = useCallback((): void => {
    if (scrollRafRef.current !== null) {
      window.cancelAnimationFrame(scrollRafRef.current);
    }
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const carousel = carouselRef.current;
      const step = getArenaCarouselStep(carousel);
      if (!carousel || step <= 0 || entries.length === 0) return;
      const progress = Math.min(entries.length - 1, Math.max(0, carousel.scrollLeft / step));
      setScrollProgress(progress);

      if (programmaticScrollRef.current) return;

      if (scrollCommitTimerRef.current !== null) {
        window.clearTimeout(scrollCommitTimerRef.current);
      }
      scrollCommitTimerRef.current = window.setTimeout(() => {
        scrollCommitTimerRef.current = null;
        const nextIndex = Math.min(entries.length - 1, Math.max(0, Math.round(progress)));
        if (nextIndex !== activeIndexRef.current) {
          activeIndexRef.current = nextIndex;
          onActiveIndexChange(nextIndex);
        }
      }, 120);
    });
  }, [entries.length, onActiveIndexChange]);

  return (
    <div
      style={{
        minHeight: 0,
        flex: '1 1 auto',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 'clamp(6px, 1.4vh, 10px)',
        paddingTop: 'clamp(0px, 4.5vh, 34px)',
        transform: launchingEntryId ? 'translate3d(0, 34px, 0) scale(0.82)' : 'none',
        opacity: launchingEntryId ? 0 : 1,
        filter: launchingEntryId ? 'blur(10px)' : 'none',
        transition:
          'transform 420ms cubic-bezier(.18,.82,.24,1), opacity 300ms ease, filter 420ms cubic-bezier(.18,.82,.24,1)',
        pointerEvents: launchingEntryId ? 'none' : undefined,
      }}
    >
      <div
        aria-label="Разделы на площадке"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 462,
          margin: '0 auto',
          padding: '0',
        }}
      >
        <div
          ref={carouselRef}
          onScroll={handleScroll}
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            gap: 'clamp(10px, 3vw, 12px)',
            overflowX: 'auto',
            scrollSnapType: 'x mandatory',
            scrollPaddingInline: 'clamp(12px, 3.8vw, 20px)',
            overscrollBehaviorX: 'contain',
            WebkitOverflowScrolling: 'touch',
            padding: '0 clamp(12px, 3.8vw, 20px) 12px',
            scrollbarWidth: 'none',
            perspective: 920,
            perspectiveOrigin: '50% 50%',
          }}
        >
          {entries.map((entry, index) => {
            const offset = Math.max(-1, Math.min(1, index - scrollProgress));
            const absOffset = Math.abs(offset);
            return (
              <article
                key={entry.id}
                aria-label={`${entry.eyebrow}: ${entry.title}`}
                style={{
                  flex: '0 0 calc(100% - clamp(24px, 7vw, 40px))',
                  minWidth: 0,
                  aspectRatio: '4 / 3',
                  scrollSnapAlign: 'center',
                  display: 'flex',
                  overflow: 'visible',
                  perspective: 900,
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    transform: `rotateY(${offset * 10}deg) translateZ(${-absOffset * 7}px) scale(${1 - absOffset * 0.012})`,
                    transformOrigin: '50% 50%',
                    transformStyle: 'preserve-3d',
                    backfaceVisibility: 'hidden',
                    transition: 'transform 120ms ease-out, filter 120ms ease-out',
                    filter: absOffset > 0.12 ? 'brightness(0.96)' : 'none',
                  }}
                >
                  <ArenaCubeFace entry={entry} onStats={() => onStats(entry)} />
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: 'clamp(22px, 7vw, 30px)',
                      pointerEvents: 'none',
                      opacity: Math.min(0.18, absOffset * 0.24),
                      background:
                        offset > 0
                          ? 'linear-gradient(90deg, rgba(255,255,255,0.18), transparent 42%, rgba(0,0,0,0.2))'
                          : 'linear-gradient(90deg, rgba(0,0,0,0.2), transparent 58%, rgba(255,255,255,0.18))',
                      transform: 'translateZ(1px)',
                    }}
                  />
                </div>
              </article>
            );
          })}
        </div>
      </div>
      <div
        aria-label="Страницы разделов"
        style={{ display: 'flex', justifyContent: 'center', gap: 6, minHeight: 10 }}
      >
        {entries.map((entry, index) => {
          const active = index === activeIndex;
          const hiddenByLaunch = launchingEntryId !== null;
          return (
            <span
              key={entry.id}
              aria-label={`Выбрать ${entry.eyebrow}`}
              style={{
                width: active ? 20 : 7,
                height: 7,
                borderRadius: 999,
                background: active ? 'rgba(15,23,42,0.76)' : 'rgba(15,23,42,0.2)',
                display: 'block',
                opacity: hiddenByLaunch ? 0 : 1,
                transition: 'width 160ms ease, background 160ms ease',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function ArenaCubeFace({
  entry,
  onStats,
}: {
  entry: ArenaEntry;
  onStats: () => void;
}): JSX.Element {
  const titleIsLong = entry.title.length > 12;
  const showDuelIdentity = entry.kind === 'duel' && Boolean(entry.opponentName);

  return (
    <div
      className="glass"
      style={{
        position: 'relative',
        borderRadius: 'clamp(22px, 7vw, 30px)',
        padding: 0,
        overflow: 'hidden',
        boxSizing: 'border-box',
        width: '100%',
        height: '100%',
        background: 'rgba(220,236,249,0.72)',
      }}
    >
      <img
        src={entry.artworkSrc}
        alt=""
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: 'scale(1.03)',
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(8,14,28,0.18) 0%, rgba(8,14,28,0.42) 46%, rgba(8,14,28,0.74) 100%), linear-gradient(90deg, rgba(8,14,28,0.68) 0%, rgba(8,14,28,0.3) 52%, rgba(8,14,28,0.58) 100%)',
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 18% 14%, rgba(255,255,255,0.22), transparent 30%), linear-gradient(180deg, rgba(225,239,250,0.1), rgba(225,239,250,0.22))',
          backdropFilter: 'blur(1px)',
        }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 'clamp(6px, 2vw, 10px)',
          padding: 'clamp(12px, 4vw, 16px)',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: 'clamp(8px, 2.8vw, 12px)',
          }}
        >
          <div
            style={{
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 'clamp(5px, 1.8vw, 8px)',
            }}
          >
            {showDuelIdentity ? (
              <>
                <div
                  style={{
                    color: 'rgba(255,255,255,0.72)',
                    fontSize: 10,
                    fontWeight: 950,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    textShadow: '0 2px 10px rgba(0,0,0,0.36)',
                  }}
                >
                  {entry.eyebrow}
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'clamp(46px, 14vw, 54px) minmax(0, 1fr)',
                    alignItems: 'center',
                    gap: 'clamp(10px, 3vw, 14px)',
                    minWidth: 0,
                    marginTop: 2,
                  }}
                >
                  <UserAvatar
                    avatarUrl={entry.opponentAvatarUrl}
                    name={entry.opponentName}
                    size={54}
                    fontSize={22}
                    style={{
                      transform: 'translateY(4px)',
                      border: '2px solid rgba(255,255,255,0.7)',
                      boxShadow: '0 12px 26px rgba(3,10,24,0.34)',
                    }}
                  />
                  <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div
                      style={{
                        color: '#fff',
                        fontSize: 'clamp(20px, 5.6vw, 30px)',
                        lineHeight: 0.98,
                        fontWeight: 950,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        textShadow: '0 4px 18px rgba(0,0,0,0.48)',
                      }}
                    >
                      {entry.title}
                    </div>
                    {entry.typeLabel && (
                      <div
                        style={{
                          color: 'rgba(255,255,255,0.76)',
                          fontSize: 'clamp(10px, 3vw, 12px)',
                          fontWeight: 900,
                          lineHeight: 1.1,
                          textShadow: '0 3px 12px rgba(0,0,0,0.4)',
                        }}
                      >
                        {entry.typeLabel}
                      </div>
                    )}
                    <div
                      style={{
                        color: 'rgba(255,255,255,0.86)',
                        fontSize: 'clamp(12px, 3.5vw, 14px)',
                        fontWeight: 900,
                        lineHeight: 1.08,
                        textShadow: '0 3px 14px rgba(0,0,0,0.42)',
                      }}
                    >
                      {entry.subtitle}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div
                  style={{
                    color: 'rgba(255,255,255,0.72)',
                    fontSize: 10,
                    fontWeight: 950,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    textShadow: '0 2px 10px rgba(0,0,0,0.36)',
                  }}
                >
                  {entry.eyebrow}
                </div>
                <div
                  style={{
                    color: '#fff',
                    fontSize: titleIsLong ? 'clamp(20px, 5.4vw, 29px)' : 'clamp(23px, 6.8vw, 34px)',
                    lineHeight: 0.96,
                    fontWeight: 950,
                    overflowWrap: 'break-word',
                    wordBreak: titleIsLong ? 'break-word' : 'normal',
                    hyphens: 'auto',
                    maxWidth: entry.kind === 'daily' ? 'min(100%, 270px)' : '100%',
                    textShadow: '0 4px 18px rgba(0,0,0,0.48)',
                  }}
                >
                  {entry.title}
                </div>
              </>
            )}
            {!showDuelIdentity && (
              <div
                style={{
                  maxWidth: 270,
                  color: 'rgba(255,255,255,0.78)',
                  fontSize: 'clamp(12px, 3.5vw, 14px)',
                  fontWeight: 850,
                  lineHeight: 1.15,
                  textShadow: '0 3px 14px rgba(0,0,0,0.42)',
                }}
              >
                {entry.subtitle}
              </div>
            )}
          </div>
          {entry.kind === 'daily' && (
            <button
              type="button"
              className="icon-btn"
              aria-label="Статистика"
              onClick={onStats}
              style={{
                width: 34,
                height: 34,
                background: 'rgba(230,239,248,0.78)',
                backdropFilter: 'blur(12px)',
              }}
            >
              <BarChart3 size={15} strokeWidth={2.35} />
            </button>
          )}
        </div>
        <div
          style={{
            flex: '0 0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {entry.scoreboard ? (
            <div
              style={{
                width: '100%',
                maxWidth: 'min(292px, 100%)',
                borderRadius: 'clamp(18px, 5vw, 22px)',
                padding: 'clamp(7px, 2.5vw, 10px) clamp(10px, 3vw, 14px)',
                background: 'rgba(226,239,249,0.78)',
                border: '1px solid rgba(255,255,255,0.72)',
                boxShadow: '0 18px 44px rgba(4,12,28,0.2)',
                backdropFilter: 'blur(14px)',
              }}
            >
              {entry.scoreboard}
            </div>
          ) : (
            <div
              style={{
                width: '100%',
                borderRadius: 'clamp(18px, 5vw, 22px)',
                padding: 'clamp(8px, 2.8vw, 11px) clamp(10px, 3vw, 14px)',
                background: 'rgba(226,239,249,0.8)',
                border: '1px solid rgba(255,255,255,0.72)',
                boxShadow: '0 18px 44px rgba(4,12,28,0.18)',
                backdropFilter: 'blur(14px)',
                color: 'rgba(15,23,42,0.62)',
                fontSize: 'clamp(12px, 3.5vw, 14px)',
                fontWeight: 850,
                lineHeight: 1.2,
                textAlign: 'center',
              }}
            >
              {entry.meta}
            </div>
          )}
        </div>
        <button
          type="button"
          className="btn btn--cta"
          disabled={entry.disabled}
          onClick={entry.onEnter}
          style={{
            minHeight: 'clamp(46px, 13vw, 54px)',
            justifyContent: 'center',
            width: '100%',
            fontSize: 'clamp(14px, 4vw, 16px)',
            boxShadow: '0 18px 42px rgba(4,12,28,0.34)',
          }}
        >
          {entry.ctaLabel}
        </button>
      </div>
    </div>
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

function isArenaDuelEvent(match: AmateurDuelMatch): boolean {
  return match.status === 'invited' || match.status === 'ready_check' || match.status === 'active';
}

function canStartArenaDuelPeriod(
  match: AmateurDuelMatch | AmateurDuelMatchState,
  nowMs: number,
): boolean {
  const startsAt = timestampMs(match.starts_at);
  const endsAt = timestampMs(match.ends_at);
  return (
    match.status === 'active' &&
    match.me.state === 'accepted' &&
    nowMs >= startsAt &&
    nowMs < endsAt &&
    match.me.current_period < match.rules.totalPeriods
  );
}

function arenaDuelCtaLabel(match: AmateurDuelMatch, fallbackNow: number): string {
  const nowMs = duelMatchNowMs(match, fallbackNow);
  if (match.me.state === 'period_active') return 'Продолжить дуэль';
  if (canStartArenaDuelPeriod(match, nowMs)) return 'Начать дуэль';
  if (match.status === 'invited' && match.me.state === 'invited') return 'Принять вызов';
  if (match.status === 'ready_check' && match.me.state !== 'ready') return 'Готов';
  if (match.me.state === 'break_active') return 'Перерыв';
  if (match.me.state === 'completed' || match.me.state === 'forfeit') return 'Ждём соперника';
  return 'Статус дуэли';
}

function duelNextPeriod(match: AmateurDuelMatch): number {
  if (match.me.state === 'period_active') return match.me.current_period;
  return Math.min(match.rules.totalPeriods, Math.max(1, match.me.current_period + 1));
}

function duelParticipantPeriodRule(
  match: AmateurDuelMatch,
  participant: AmateurDuelMatch['me'],
): AmateurDuelPeriodRule {
  const periodNumber =
    participant.state === 'period_active'
      ? participant.current_period
      : Math.min(match.rules.totalPeriods, participant.current_period + 1);
  return (
    match.rules.periodRules.find((rule) => rule.periodNumber === periodNumber) ?? {
      periodNumber,
      mode: match.rules.duelVariant === 'time_attack' ? 'time_attack' : 'quota',
      durationMs: match.rules.periodDurationMs,
      shotsLimit: match.rules.duelVariant === 'time_attack' ? null : match.rules.shotsPerPeriod,
    }
  );
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
    match.me.state === 'invited' ||
    match.me.state === 'loadout_pending' ||
    match.me.state === 'ready'
  ) {
    const readyEndsAt = timestampMs(match.ready_expires_at);
    if (match.status === 'ready_check' && readyEndsAt > now) {
      const value = formatMs(readyEndsAt - now);
      const isWaitingForOpponent = match.me.state === 'ready';
      return {
        activePeriod: duelNextPeriod(match),
        ariaLabel: `${isWaitingForOpponent ? 'Ждём готовность соперника' : 'Комната готовности'}. До отмены ${value}. Счёт ${score}`,
        label: isWaitingForOpponent ? 'До отмены' : 'Готовность',
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

  if (match.status === 'active' && match.opponent.state === 'period_active') {
    const opponentRule = duelParticipantPeriodRule(match, match.opponent);
    if (opponentRule.mode === 'quota' && opponentRule.shotsLimit !== null) {
      const remaining = Math.max(0, opponentRule.shotsLimit - match.opponent.current_period_shots);
      const value = `${remaining}/${opponentRule.shotsLimit}`;
      return {
        activePeriod: match.opponent.current_period,
        ariaLabel: `Соперник играет ${match.opponent.current_period}-й период. Осталось бросков ${value}. Счёт ${score}`,
        label: 'Броски соперника',
        value,
      };
    }
    const opponentPeriodEndsAt = timestampMs(match.opponent.period_ends_at);
    if (opponentPeriodEndsAt > now) {
      const value = formatMs(opponentPeriodEndsAt - now);
      return {
        activePeriod: match.opponent.current_period,
        ariaLabel: `Соперник играет ${match.opponent.current_period}-й период. До конца ${value}. Счёт ${score}`,
        label: 'Соперник',
        value,
      };
    }
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

  if (match.status === 'active' && endsAt > now) {
    const value = formatMs(endsAt - now);
    const waitingForOpponent =
      match.me.state === 'completed' ||
      match.me.state === 'forfeit' ||
      match.opponent.state === 'accepted';
    const label =
      match.me.state === 'accepted'
        ? 'До поражения'
        : waitingForOpponent
          ? 'До поражения соперника'
          : 'До таймаута';
    return {
      activePeriod: match.rules.totalPeriods,
      ariaLabel: `${label} ${value}. Счёт ${score}`,
      label,
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
  children,
  onClose,
}: {
  title: string;
  text?: string;
  children?: ReactNode;
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
        {children ?? (
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{text}</div>
        )}
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

function TrainingPlaceholder({
  autoPlay = false,
  onBack,
  onPlayHome,
  onPlayStart,
  playEntranceOnStart = false,
  onEntranceConsumed,
  playRouteTransitionOnStart = false,
  onRouteTransitionConsumed,
}: {
  autoPlay?: boolean;
  onBack: () => void;
  onPlayHome?: () => void;
  onPlayStart?: () => void;
  playEntranceOnStart?: boolean;
  onEntranceConsumed?: () => void;
  playRouteTransitionOnStart?: boolean;
  onRouteTransitionConsumed?: (() => void) | undefined;
}): JSX.Element {
  const data = useTrainingSessionStore((s) => s.data);
  const loading = useTrainingSessionStore((s) => s.loading);
  const error = useTrainingSessionStore((s) => s.error);
  const inFlight = useTrainingSessionStore((s) => s.inFlight);
  const refresh = useTrainingSessionStore((s) => s.refresh);
  const start = useTrainingSessionStore((s) => s.start);
  const [selectedPeriod, setSelectedPeriod] = useState<1 | 2 | 3>(1);
  const [playTraining, setPlayTraining] = useState(false);
  const [localPlayEntrance, setLocalPlayEntrance] = useState(false);
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
    if (!autoPlay && data?.state !== 'active') setPlayTraining(false);
  }, [autoPlay, data?.state]);

  useEffect(() => {
    if (autoPlay && data) setPlayTraining(true);
  }, [autoPlay, data]);

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
    if (next?.state === 'active') {
      setLocalPlayEntrance(data?.state !== 'active');
      setPlayTraining(true);
      onPlayStart?.();
    }
  };

  if (data && playTraining) {
    const shouldPlayEntrance = playEntranceOnStart || localPlayEntrance;
    return (
      <TrainingPlayView
        onBack={() => {
          setLocalPlayEntrance(false);
          setPlayTraining(false);
          (onPlayHome ?? onBack)();
        }}
        playEntranceOnMount={shouldPlayEntrance}
        onEntranceConsumed={() => {
          setLocalPlayEntrance(false);
          onEntranceConsumed?.();
        }}
        playRouteTransitionOnMount={playRouteTransitionOnStart}
        onRouteTransitionConsumed={onRouteTransitionConsumed}
      />
    );
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

function msSinceLastSeen(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const seenAt = Date.parse(iso);
  if (Number.isNaN(seenAt)) return null;
  return Date.now() - seenAt;
}

function isOpponentOnlineNow(iso: string | null | undefined): boolean {
  const ms = msSinceLastSeen(iso);
  return ms !== null && ms <= OPPONENT_ONLINE_WINDOW_MS;
}

function isOpponentRecentlySeen(iso: string | null | undefined): boolean {
  const ms = msSinceLastSeen(iso);
  return ms !== null && ms <= OPPONENT_RECENT_WINDOW_MS;
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

function duelTemplateSummaryParts(template: AmateurDuelTemplate): string[] {
  const rules = template.period_rules.length > 0 ? template.period_rules : [];
  const periodCount = formatRuCount(template.total_periods, 'период', 'периода', 'периодов');
  if (rules.length === 0) {
    const minutes = Math.round(template.period_duration_ms / 60_000);
    return [
      periodCount,
      minutes >= 1 && template.period_duration_ms % 60_000 === 0
        ? `${minutes} мин`
        : formatMs(template.period_duration_ms),
    ];
  }

  const allQuota = rules.every((rule) => rule.mode === 'quota');
  const allTimeAttack = rules.every((rule) => rule.mode === 'time_attack');
  const sameDuration = rules.every((rule) => rule.durationMs === rules[0]!.durationMs);

  if (allQuota) {
    const totalShots = rules.reduce(
      (sum, rule) => sum + (rule.shotsLimit ?? template.shots_per_period),
      0,
    );
    return [
      periodCount,
      ...(sameDuration ? [duelPeriodDurationText(rules[0]!)] : []),
      formatRuCount(totalShots, 'бросок', 'броска', 'бросков'),
    ];
  }

  if (allTimeAttack && sameDuration) {
    return [periodCount, duelPeriodDurationText(rules[0]!), 'на скорость'];
  }

  return [
    periodCount,
    rules
      .map((rule) => {
        if (rule.mode === 'quota') {
          return formatRuCount(
            rule.shotsLimit ?? template.shots_per_period,
            'бросок',
            'броска',
            'бросков',
          );
        }
        return `${duelPeriodDurationText(rule)} на скорость`;
      })
      .join(' + '),
  ];
}

function duelPeriodStartText(rule: AmateurDuelPeriodRule): string {
  if (rule.mode === 'quota') {
    return `${formatMs(rule.durationMs)} и ${rule.shotsLimit ?? 30} бросков.`;
  }
  if (rule.durationMs === 180_000) {
    return 'Необходимо забить как можно больше шайб за три минуты.';
  }
  return `Необходимо забить как можно больше шайб за ${formatMs(rule.durationMs)}.`;
}

function duelPeriodStartLead(match: AmateurDuelMatch, nextPeriod: number): string {
  if (match.rules.totalPeriods <= 1) return 'Сейчас стартует период';
  return `Сейчас стартует ${nextPeriod}-й период из ${match.rules.totalPeriods}`;
}

function currentDuelPeriodRule(match: AmateurDuelMatch): AmateurDuelPeriodRule {
  return duelParticipantPeriodRule(match, match.me);
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
  if (match.status === 'active') {
    if (match.me.state === 'completed' || match.me.state === 'forfeit') return 'Ждём соперника';
    if (match.opponent.state === 'completed' || match.opponent.state === 'forfeit')
      return 'Ваш ход';
    if (match.me.state === 'accepted') return 'Ваш ход';
    return 'Идёт';
  }
  if (match.status === 'cancelled' && match.settled_reason === 'declined') {
    return match.me.state === 'forfeit' ? 'Вы отказались' : 'Отказ';
  }
  if (match.status === 'cancelled') return 'Отменена';
  return 'Истекла';
}

function currentMoscowSeasonKey(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  return `${year}-${month}`;
}

function duelHistoryStats(matches: AmateurDuelMatch[]): {
  duels: number;
  wins: number;
  points: number;
} {
  return matches.reduce(
    (acc, match) => ({
      duels: acc.duels + 1,
      wins: acc.wins + (match.winner_user_id === match.me.user_id ? 1 : 0),
      points: acc.points + match.me.result_points,
    }),
    { duels: 0, wins: 0, points: 0 },
  );
}

function DuelStatusBadge({ match }: { match: AmateurDuelMatch }): JSX.Element {
  const status = duelOutcomeText(match);
  const dotColor =
    match.status === 'settled' && match.outcome === 'draw'
      ? '#f59e0b'
      : match.status === 'settled' && match.winner_user_id === match.me.user_id
        ? '#22c55e'
        : match.status === 'settled' && match.winner_user_id === match.opponent.user_id
          ? '#ef4444'
          : match.status === 'active'
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
  const toggleKind = (kind: AmateurDuelKind) => {
    const next = selectedSet.has(kind)
      ? selected.filter((cur) => cur !== kind)
      : [...selected, kind];
    onChange(DUEL_KIND_OPTIONS.filter((cur) => next.includes(cur)));
  };

  return (
    <div className="glass" style={{ borderRadius: 16, padding: '10px 10px 12px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 8,
        }}
      >
        <div className="section-label" style={{ margin: 0, transform: 'translateX(-14px)' }}>
          Форматы поиска
        </div>
        <button
          type="button"
          className="section-info-btn"
          onClick={onInfo}
          aria-label="Правила поиска соперника"
        >
          <Info size={12} color="var(--muted)" />
        </button>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 6,
        }}
      >
        {DUEL_KIND_OPTIONS.map((kind) => (
          <DuelKindPreferenceButton
            key={kind}
            label={duelKindText(kind)}
            checked={selectedSet.has(kind)}
            active={selectedSet.has(kind)}
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
        minHeight: 32,
        borderRadius: 999,
        border: active ? '1px solid rgba(15, 23, 42, 0.18)' : '1px solid rgba(255,255,255,0.72)',
        background: active ? 'rgba(255,255,255,0.68)' : 'rgba(255,255,255,0.3)',
        color: 'var(--ink)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 6,
        padding: '0 9px',
        fontSize: 10,
        fontWeight: 900,
        letterSpacing: '0',
        boxShadow: active ? '0 8px 18px rgba(15, 23, 42, 0.08)' : 'none',
        whiteSpace: 'nowrap',
        minWidth: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
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

function MatchmakingRulesContent(): JSX.Element {
  const ruleItems: Array<{ title: string; text: string }> = [
    { title: 'Экспресс', text: '1 период, 3 минуты. Нужно забить как можно больше шайб.' },
    {
      title: 'Экспресс+',
      text: '2 периода: первый до 30 бросков, второй 3 минуты на скорость.',
    },
    {
      title: 'Классика',
      text: '3 периода как в ежедневной игре: 30 бросков в каждом, перерыв 2 минуты.',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.45, fontWeight: 700 }}>
        Поиск длится 2 минуты. Соперник подбирается среди игроков, у которых пересекается хотя бы
        один выбранный формат.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ruleItems.map((item) => (
          <div
            key={item.title}
            style={{
              display: 'grid',
              gridTemplateColumns: '92px minmax(0, 1fr)',
              gap: 8,
              alignItems: 'start',
            }}
          >
            <div
              style={{
                color: 'var(--ink)',
                fontSize: 12,
                fontWeight: 950,
                lineHeight: 1.25,
              }}
            >
              {item.title}
            </div>
            <div
              style={{
                color: 'var(--muted)',
                fontSize: 12,
                fontWeight: 700,
                lineHeight: 1.35,
              }}
            >
              {item.text}
            </div>
          </div>
        ))}
      </div>
    </div>
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
  const [historyScope, setHistoryScope] = useState<DuelHistoryScope>('current');
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
  const [quickPickInfoOpen, setQuickPickInfoOpen] = useState(false);
  const [opponentSearchInfoOpen, setOpponentSearchInfoOpen] = useState(false);
  const [lockerInfoOpen, setLockerInfoOpen] = useState(false);
  const [historyResultMatch, setHistoryResultMatch] = useState<AmateurDuelMatch | null>(null);
  const [ratingProfile, setRatingProfile] = useState<UserPickerItem | null>(null);
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
    queryKey: ['amateur-duel', 'opponents', 'search', opponentQuery],
    queryFn: () => searchAmateurOpponents(opponentQuery, 12),
    enabled: duelCreationMode === 'challenge' && opponentQuery.trim().length > 0,
  });
  const onlineOpponents = useQuery({
    queryKey: ['amateur-duel', 'opponents', 'online'],
    queryFn: () => searchAmateurOpponents('', 12),
    enabled: duelCreationMode === 'challenge',
  });
  const rating = useQuery({
    queryKey: ['amateur-duel', 'rating'],
    queryFn: fetchAmateurRating,
  });
  const historyResultDetails = useQuery({
    queryKey: ['amateur-duel', 'matches', historyResultMatch?.id],
    queryFn: () => fetchAmateurMatch(historyResultMatch?.id ?? ''),
    enabled: historyResultMatch !== null,
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
  const cancelChallengeMut = useMutation({
    mutationFn: (matchId: string) => cancelAmateurDuel(matchId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['amateur-duel'] });
    },
  });

  const templateItems = templates.data?.templates ?? [];
  const activeMatches = (matches.data?.matches ?? []).filter(
    (match) =>
      match.status === 'invited' || match.status === 'ready_check' || match.status === 'active',
  );
  const openDuelSlotsUsed = activeMatches.length;
  const hasOpenDuelSlot = openDuelSlotsUsed < 5;
  const history = (matches.data?.matches ?? []).filter(
    (match) =>
      match.status === 'settled' || match.status === 'expired' || match.status === 'cancelled',
  );
  const currentSeasonKey = rating.data?.season_key ?? currentMoscowSeasonKey();
  const filteredHistory =
    historyScope === 'current'
      ? history.filter((match) => match.season_key === currentSeasonKey)
      : history;
  const historyStats = duelHistoryStats(filteredHistory);
  const selectedTemplate = selectedTemplateId
    ? (templateItems.find((item) => item.id === selectedTemplateId) ?? null)
    : (templateItems[0] ?? null);
  const selectedTemplateSummaryParts = selectedTemplate
    ? duelTemplateSummaryParts(selectedTemplate)
    : [];
  const opponentOptions = opponentQuery.trim().length > 0 ? (opponents.data?.users ?? []) : [];
  const onlineOpponentOptions = (onlineOpponents.data?.users ?? []).filter((opponent) => {
    return isOpponentRecentlySeen(opponent.lastSeenAt);
  });
  const suggestedOpponentOptions =
    onlineOpponentOptions.length > 0 ? onlineOpponentOptions : (onlineOpponents.data?.users ?? []);
  const matchmakingTicket = matchmakingMut.data?.ticket ?? null;
  const matchmakingRemaining = matchmakingTicket
    ? new Date(matchmakingTicket.expires_at).getTime() - matchmakingNow
    : 0;
  const isMatchmakingActive = matchmakingTicket !== null && matchmakingRemaining > 0;
  const isMatchmakingExpired =
    matchmakingTicket !== null && matchmakingRemaining <= 0 && !matchmakingMut.isPending;
  const canStartMatchmaking =
    hasOpenDuelSlot &&
    matchmakingKinds.length > 0 &&
    !matchmakingMut.isPending &&
    !isMatchmakingActive;

  useEffect(() => {
    if (!selectedTemplateId && templateItems[0]) setSelectedTemplateId(templateItems[0].id);
  }, [selectedTemplateId, templateItems]);

  useEffect(() => {
    if (!matchmakingTicket) return undefined;
    const id = window.setInterval(() => setMatchmakingNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [matchmakingTicket]);

  const canChallenge =
    hasOpenDuelSlot &&
    selectedTemplate !== null &&
    selectedOpponent !== null &&
    !challengeMut.isPending;

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
          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="section-label section-label--page">Новая дуэль</div>
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
                {templateItems.length > 0 && selectedTemplate ? (
                  <>
                    <GlassSelect
                      ariaLabel="Шаблон дуэли"
                      value={selectedTemplate.id}
                      options={templateItems.map((template) => ({
                        value: template.id,
                        label: template.title,
                      }))}
                      onChange={setSelectedTemplateId}
                    />
                    <div
                      aria-label="Параметры дуэли"
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 7,
                        padding: '0 4px',
                        color: 'var(--muted)',
                        fontSize: 13,
                        fontWeight: 800,
                        lineHeight: 1.25,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {selectedTemplateSummaryParts.map((part, index) => (
                        <span key={`${part}-${index}`} style={{ display: 'inline-flex', gap: 7 }}>
                          {index > 0 && (
                            <span aria-hidden="true" style={{ opacity: 0.55 }}>
                              ·
                            </span>
                          )}
                          <span>{part}</span>
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ color: 'var(--muted)', fontSize: 14 }}>Нет активных шаблонов</div>
                )}
                <div
                  className="section-label section-label--page"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    marginBottom: -4,
                    paddingRight: 0,
                  }}
                >
                  <span>Быстрый выбор</span>
                  <button
                    type="button"
                    className="section-info-btn"
                    onClick={() => setQuickPickInfoOpen(true)}
                    aria-label="Что такое быстрый выбор"
                  >
                    <Info size={12} color="var(--muted)" />
                  </button>
                </div>
                <div className="glass" style={{ borderRadius: 18, padding: 12 }}>
                  <div
                    aria-label="Быстрый выбор соперника"
                    className="no-scrollbar"
                    style={{
                      display: 'flex',
                      gap: 10,
                      overflowX: 'auto',
                      paddingTop: 2,
                      paddingBottom: 2,
                    }}
                  >
                    {suggestedOpponentOptions.length > 0 ? (
                      suggestedOpponentOptions.map((opponent) => {
                        const active = selectedOpponent?.userId === opponent.userId;
                        return (
                          <button
                            key={opponent.userId}
                            type="button"
                            aria-label={`Выбрать соперника ${opponent.displayName}`}
                            onClick={() => {
                              setSelectedOpponent(opponent);
                              setOpponentQuery('');
                            }}
                            style={{
                              width: 58,
                              flex: '0 0 auto',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: 6,
                              color: active ? 'var(--ink)' : 'var(--muted)',
                              fontSize: 10,
                              fontWeight: 900,
                              lineHeight: 1.05,
                              background: 'transparent',
                              border: 'none',
                              padding: 0,
                              textAlign: 'center',
                            }}
                          >
                            <span style={{ position: 'relative', display: 'inline-flex' }}>
                              <UserAvatar
                                avatarUrl={opponent.avatarUrl}
                                name={opponent.displayName}
                                size={44}
                                fontSize={16}
                                style={{
                                  boxShadow: active
                                    ? '0 0 0 3px #f59e0b, 0 10px 18px rgba(15, 23, 42, 0.18)'
                                    : '0 8px 16px rgba(15, 23, 42, 0.12)',
                                }}
                              />
                              <span
                                aria-hidden="true"
                                style={{
                                  position: 'absolute',
                                  right: 1,
                                  bottom: 1,
                                  width: 11,
                                  height: 11,
                                  borderRadius: 999,
                                  background: isOpponentOnlineNow(opponent.lastSeenAt)
                                    ? '#22c55e'
                                    : '#94a3b8',
                                  border: '2px solid rgba(226, 240, 252, 0.98)',
                                }}
                              />
                            </span>
                            <span
                              style={{
                                width: '100%',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {opponent.displayName}
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <div style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 700 }}>
                        Игроков пока не видно. Можно найти по имени.
                      </div>
                    )}
                  </div>
                </div>
                <div
                  className="section-label section-label--page"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    marginBottom: -4,
                    paddingRight: 0,
                  }}
                >
                  <span>Поиск</span>
                  <button
                    type="button"
                    className="section-info-btn"
                    onClick={() => setOpponentSearchInfoOpen(true)}
                    aria-label="Как работает поиск соперника"
                  >
                    <Info size={12} color="var(--muted)" />
                  </button>
                </div>
                <div className="glass-dock-field" style={{ minHeight: 48 }}>
                  <Search size={14} color="var(--muted)" aria-hidden />
                  <input
                    aria-label="Поиск соперника"
                    value={opponentQuery}
                    onChange={(event) => {
                      setOpponentQuery(event.target.value);
                      setSelectedOpponent(null);
                    }}
                    placeholder="Имя или фамилия"
                    type="search"
                    style={{
                      flex: 1,
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      color: 'var(--ink)',
                      fontSize: 14,
                      fontWeight: 800,
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
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
                      onClick={() => {
                        setSelectedOpponent(opponent);
                        setOpponentQuery('');
                      }}
                      className="glass"
                      style={{
                        minHeight: 58,
                        borderRadius: 20,
                        padding: '8px 12px',
                        display: 'grid',
                        gridTemplateColumns: '42px minmax(0, 1fr)',
                        alignItems: 'center',
                        gap: 12,
                        textAlign: 'left',
                        border:
                          selectedOpponent?.userId === opponent.userId
                            ? '2px solid #f59e0b'
                            : '1px solid rgba(255,255,255,0.8)',
                      }}
                    >
                      <span style={{ position: 'relative', display: 'inline-flex' }}>
                        <UserAvatar
                          avatarUrl={opponent.avatarUrl}
                          name={opponent.displayName}
                          size={42}
                          fontSize={15}
                        />
                        <span
                          aria-hidden="true"
                          style={{
                            position: 'absolute',
                            right: 0,
                            bottom: 0,
                            width: 11,
                            height: 11,
                            borderRadius: 999,
                            background: isOpponentOnlineNow(opponent.lastSeenAt)
                              ? '#22c55e'
                              : '#94a3b8',
                            border: '2px solid rgba(226, 240, 252, 0.98)',
                          }}
                        />
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span
                          style={{
                            display: 'block',
                            color: 'var(--ink)',
                            fontSize: 16,
                            fontWeight: 900,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {opponent.displayName}
                        </span>
                        <span
                          style={{
                            display: 'block',
                            color: 'var(--muted)',
                            fontSize: 11,
                            fontWeight: 800,
                          }}
                        >
                          {isOpponentOnlineNow(opponent.lastSeenAt)
                            ? 'сейчас в игре'
                            : isOpponentRecentlySeen(opponent.lastSeenAt)
                              ? 'недавно был'
                              : 'доступен для вызова'}
                        </span>
                      </span>
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
            <div
              className="section-label section-label--page"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>Текущие дуэли ({openDuelSlotsUsed}/5)</span>
            </div>
            {activeMatches.length === 0 && (
              <div
                role="status"
                style={{
                  minHeight: 132,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  textAlign: 'center',
                  color: 'var(--muted)',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 999,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(226, 240, 252, 0.52)',
                    border: '1px solid rgba(255, 255, 255, 0.76)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)',
                  }}
                >
                  <Swords size={20} strokeWidth={2.2} />
                </span>
                <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.35 }}>
                  Пока нет приглашений и текущих дуэлей
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.35, opacity: 0.78 }}>
                  Начните поиск или вызовите игрока выше.
                </div>
              </div>
            )}
            {activeMatches.map((match) => {
              const canCancelInvite =
                match.status === 'invited' &&
                match.source === 'challenge' &&
                match.me.side === 'challenger';
              return (
                <DuelListCard
                  key={match.id}
                  match={match}
                  onOpen={() => onOpenMatch(match.id)}
                  {...(canCancelInvite
                    ? {
                        onCancelInvite: () => cancelChallengeMut.mutate(match.id),
                        cancelInvitePending:
                          cancelChallengeMut.isPending && cancelChallengeMut.variables === match.id,
                      }
                    : {})}
                />
              );
            })}
          </section>
        </>
      )}

      {duelTab === 'locker' && (
        <DuelLockerTab
          onInfo={() => setLockerInfoOpen(true)}
          onOpenInventory={() => navigate('/inventory')}
        />
      )}

      {duelTab === 'rating' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="section-label section-label--page">Рейтинг</div>
          {(rating.data?.rating ?? []).length === 0 ? (
            <div className="glass" style={{ borderRadius: 18, padding: 14, color: 'var(--muted)' }}>
              Рейтинг появится после первых завершённых дуэлей.
            </div>
          ) : (
            <>
              <div
                aria-hidden="true"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '20px minmax(0, 1fr) auto',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0 14px 0',
                  color: 'rgba(15, 23, 42, 0.55)',
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                }}
              >
                <span>#</span>
                <span style={{ paddingLeft: 44 }}>Игрок</span>
                <span>Очки</span>
              </div>
              {(rating.data?.rating ?? []).slice(0, 10).map((row, index) => {
                const isMe = currentUserId === row.user_id;
                return (
                  <button
                    type="button"
                    key={row.user_id}
                    className="glass"
                    aria-label={`Открыть профиль ${row.display_name}`}
                    onClick={() =>
                      setRatingProfile({
                        userId: row.user_id,
                        displayName: row.display_name,
                        avatarUrl: row.avatar_url,
                      })
                    }
                    style={{
                      width: '100%',
                      borderRadius: 16,
                      padding: '10px 14px',
                      display: 'grid',
                      gridTemplateColumns: '20px minmax(0, 1fr) auto',
                      alignItems: 'center',
                      gap: 8,
                      minHeight: 48,
                      color: isMe ? '#ffffff' : 'var(--ink)',
                      fontSize: 14,
                      fontWeight: 800,
                      textAlign: 'left',
                      cursor: 'pointer',
                      border: isMe
                        ? '1px solid rgba(255,255,255,0.22)'
                        : '1px solid rgba(255,255,255,0.8)',
                      background: isMe
                        ? 'linear-gradient(180deg, rgba(15, 23, 42, 0.94), rgba(30, 41, 59, 0.94))'
                        : undefined,
                      boxShadow: isMe ? '0 12px 24px rgba(15, 23, 42, 0.2)' : undefined,
                    }}
                  >
                    <span>{index + 1}</span>
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        minWidth: 0,
                      }}
                    >
                      <UserAvatar
                        avatarUrl={row.avatar_url}
                        name={row.display_name}
                        size={34}
                        fontSize={14}
                        alt={`Аватар ${row.display_name}`}
                      />
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.display_name}
                      </span>
                    </span>
                    <span
                      style={{
                        justifySelf: 'end',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.points}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </section>
      )}

      {duelTab === 'history' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="section-label section-label--page">История</div>
          <SegmentedControl
            ariaLabel="Фильтр истории дуэлей"
            value={historyScope}
            items={[
              { id: 'current', label: 'Текущий месяц' },
              { id: 'all', label: 'Всё время' },
            ]}
            onChange={(id) => setHistoryScope(id as DuelHistoryScope)}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <TotalCell label="ДУЭЛИ" value={String(historyStats.duels)} />
            <TotalCell label="ПОБЕДЫ" value={String(historyStats.wins)} />
            <TotalCell label="ОЧКИ" value={String(historyStats.points)} />
          </div>
          {filteredHistory.length === 0 ? (
            <div className="glass" style={{ borderRadius: 18, padding: 14, color: 'var(--muted)' }}>
              {historyScope === 'current'
                ? 'За текущий месяц дуэлей пока нет.'
                : 'Архив появится после первых завершённых дуэлей.'}
            </div>
          ) : (
            filteredHistory
              .slice(0, 12)
              .map((match) => (
                <DuelListCard
                  key={match.id}
                  match={match}
                  onOpen={() => setHistoryResultMatch(match)}
                />
              ))
          )}
        </section>
      )}
      {historyResultMatch && (
        <DuelResultModal
          match={historyResultDetails.data?.match ?? historyResultMatch}
          isLoadingDetails={historyResultDetails.isFetching && !historyResultDetails.data}
          closeLabel="Понятно"
          onClose={() => setHistoryResultMatch(null)}
        />
      )}
      {matchmakingRulesOpen && (
        <ModeInfoModal title="Правила поиска" onClose={() => setMatchmakingRulesOpen(false)}>
          <MatchmakingRulesContent />
        </ModeInfoModal>
      )}
      {quickPickInfoOpen && (
        <ModeInfoModal
          title="Быстрый выбор"
          text="Здесь показаны последние активные игроки любительской лиги. Нажмите на аватар, чтобы выбрать соперника для прямого вызова."
          onClose={() => setQuickPickInfoOpen(false)}
        />
      )}
      {opponentSearchInfoOpen && (
        <ModeInfoModal
          title="Поиск соперника"
          text="Введите имя или фамилию игрока. Вызвать можно только любителя или профессионала; новичков в дуэли вызвать нельзя."
          onClose={() => setOpponentSearchInfoOpen(false)}
        />
      )}
      {lockerInfoOpen && (
        <ModeInfoModal
          title="Раздевалка"
          text="Здесь позже появится набор инвентаря по умолчанию для быстрых дуэлей. В текущем MVP предметы выбираются перед стартом матча в комнате готовности."
          onClose={() => setLockerInfoOpen(false)}
        />
      )}
      <UserProfileSheet sender={ratingProfile} onClose={() => setRatingProfile(null)} />
    </ModeShell>
  );
}

function DuelLockerTab({
  onInfo,
  onOpenInventory,
}: {
  onInfo: () => void;
  onOpenInventory: () => void;
}): JSX.Element {
  return (
    <>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          className="section-label section-label--page"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            paddingRight: 0,
          }}
        >
          <span>Раздевалка</span>
          <button
            type="button"
            className="section-info-btn"
            onClick={onInfo}
            aria-label="Что такое раздевалка"
          >
            <Info size={12} color="var(--muted)" />
          </button>
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
  onOpen,
  onCancelInvite,
  cancelInvitePending = false,
}: {
  match: AmateurDuelMatch;
  onOpen: () => void;
  onCancelInvite?: () => void;
  cancelInvitePending?: boolean;
}): JSX.Element {
  const opensOnCardClick =
    match.status === 'settled' || match.status === 'expired' || match.status === 'cancelled';
  const historyDate = match.starts_at;
  return (
    <div
      role="button"
      tabIndex={0}
      className="glass"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onOpen();
      }}
      style={{
        position: 'relative',
        borderRadius: 18,
        padding: '10px 12px',
        minHeight: 68,
        width: '100%',
        border: '1px solid rgba(255,255,255,0.8)',
        textAlign: 'left',
        cursor: 'pointer',
        color: 'inherit',
        background: undefined,
        fontFamily: 'inherit',
        boxShadow: opensOnCardClick ? '0 10px 22px rgba(42, 91, 132, 0.12)' : undefined,
        outline: 'none',
        display: 'grid',
        gridTemplateColumns: onCancelInvite
          ? '42px minmax(0, 1fr) auto 34px'
          : '42px minmax(0, 1fr) auto',
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
          {opensOnCardClick
            ? ` · ${formatShortDateTime(historyDate)}`
            : ` · ${match.me.goals}:${match.opponent.goals}`}
        </div>
      </div>
      <DuelStatusBadge match={match} />
      {onCancelInvite && (
        <button
          type="button"
          className="icon-btn"
          aria-label={`Отменить вызов ${match.opponent.display_name}`}
          title="Отменить вызов"
          disabled={cancelInvitePending}
          onClick={(event) => {
            event.stopPropagation();
            onCancelInvite();
          }}
          style={{
            width: 34,
            height: 34,
            minWidth: 34,
            minHeight: 34,
            opacity: cancelInvitePending ? 0.62 : 1,
          }}
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}

function AmateurDuelPlayView({
  matchId,
  onBack,
  directPlayOnly = false,
  playEntranceOnMount = false,
  onEntranceConsumed,
  playRouteTransitionOnMount = false,
  onRouteTransitionConsumed,
}: {
  matchId: string;
  onBack: () => void;
  directPlayOnly?: boolean;
  playEntranceOnMount?: boolean;
  onEntranceConsumed?: () => void;
  playRouteTransitionOnMount?: boolean;
  onRouteTransitionConsumed?: (() => void) | undefined;
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
  const [dismissedResultMatchId, setDismissedResultMatchId] = useState<string | null>(null);

  useEffect(() => {
    void load(matchId);
  }, [load, matchId]);

  useEffect(() => {
    setDismissedResultMatchId(null);
  }, [matchId]);

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

  useEffect(() => {
    if (!match || match.id !== matchId) return undefined;
    if (match.status === 'settled' || match.status === 'cancelled' || match.status === 'expired') {
      return undefined;
    }
    const id = window.setInterval(() => {
      void refresh();
    }, 3000);
    return () => window.clearInterval(id);
  }, [match, matchId, refresh]);

  useEffect(() => {
    if (!directPlayOnly || !match || match.id !== matchId || inFlight) return;
    const matchNow = duelMatchNowMs(match, now);
    if (canStartArenaDuelPeriod(match, matchNow)) {
      void startPeriod();
    }
  }, [directPlayOnly, inFlight, match, matchId, now, startPeriod]);

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
  const opponentDisplayName = match.opponent.display_name || 'Игрок';

  if (directPlayOnly && match.me.state !== 'period_active') {
    const timing = duelEventTiming(match, now);
    const inactivePeriodRule = duelParticipantPeriodRule(match, match.me);
    return (
      <PlayView<AmateurDuelMatchState>
        suppressedByModal={true}
        showIceCar={true}
        playRouteTransitionOnMount={playRouteTransitionOnMount}
        onRouteTransitionConsumed={onRouteTransitionConsumed}
        onBack={onBack}
        active={false}
        seed={match.match_seed}
        goalieId={match.rules.goalieId}
        periodNumber={duelNextPeriod(match)}
        periodSpeedPresets={match.period_speed_presets}
        stickEffects={match.stick_effects}
        periodsTotal={match.rules.totalPeriods}
        goals={match.me.goals}
        shots={match.me.shots_taken}
        shotsTotal={
          inactivePeriodRule.mode === 'quota'
            ? (inactivePeriodRule.shotsLimit ?? match.rules.shotsPerPeriod)
            : undefined
        }
        timer={timing.value}
        timerLabel={timing.label}
        shotButtonLabel={inFlight ? 'ОТКРЫВАЕМ...' : arenaDuelCtaLabel(match, now).toUpperCase()}
        backLabel="К арене"
        optimisticAddShot={optimisticAddShot}
        submitShot={submitShot}
        applyState={applyState}
        scoreboardOpponent={duelScoreboardOpponent(match)}
      />
    );
  }

  if (match.status === 'ready_check') {
    const readyEndsAt = match.ready_expires_at ? new Date(match.ready_expires_at).getTime() : 0;
    const readyText = readyEndsAt > now ? formatMs(readyEndsAt - now) : '00:00';
    return (
      <ModeShell title="Комната дуэли" onBack={onBack}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <TotalCell label="ФОРМАТ" value={`${match.rules.totalPeriods}П`} />
          <TotalCell label="ТИП" value={duelKindText(match.rules.duelKind)} />
          <TotalCell label="ГОТОВ" value={readyText} />
        </div>
        <div className="glass" style={{ borderRadius: 18, padding: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--ink)', marginBottom: 6 }}>
            {match.rules.title}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.45 }}>
            Соперник: {opponentDisplayName}. Выберите инвентарь и нажмите «Готов».
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
      </ModeShell>
    );
  }

  if (match.me.state === 'period_active') {
    const activePeriodRule = currentDuelPeriodRule(match);
    return (
      <PlayView<AmateurDuelMatchState>
        suppressedByModal={false}
        showIceCar={false}
        playEntranceOnMount={playEntranceOnMount}
        onEntranceConsumed={onEntranceConsumed}
        playRouteTransitionOnMount={playRouteTransitionOnMount}
        onRouteTransitionConsumed={onRouteTransitionConsumed}
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
        shotsTotal={
          activePeriodRule.mode === 'quota' ? (activePeriodRule.shotsLimit ?? 30) : undefined
        }
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
          ? 'Вы завершили игру, ждём соперника'
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
        ? 'Ждём соперника'
        : 'Период недоступен';
  const showResultModal = match.status === 'settled' && dismissedResultMatchId !== match.id;

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
          title="Дуэль начинается"
          lead={duelPeriodStartLead(match, nextPeriod)}
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
      {showResultModal && <DuelResultModal match={match} onClose={onBack} />}
    </ModeShell>
  );
}

function DuelResultModal({
  match,
  onClose,
  closeLabel = 'Понятно',
  isLoadingDetails = false,
}: {
  match: AmateurDuelMatch;
  onClose: () => void;
  closeLabel?: string;
  isLoadingDetails?: boolean;
}): JSX.Element {
  const title =
    match.status !== 'settled'
      ? duelOutcomeText(match)
      : match.outcome === 'draw'
        ? 'Ничья'
        : match.outcome === 'double_loss'
          ? 'Дуэль не сыграна'
          : match.winner_user_id === match.me.user_id
            ? 'Победа'
            : 'Поражение';
  const resultColor =
    title === 'Победа'
      ? '#22c55e'
      : title === 'Ничья'
        ? '#f59e0b'
        : title === 'Поражение'
          ? '#ef4444'
          : 'rgba(15, 23, 42, 0.38)';
  const points = match.me.result_points;
  const pointsText = points > 0 ? `+${points}` : '0';
  const mePeriods = hasDuelPeriodDetails(match) ? match.recent_periods : [];
  const opponentPeriods = hasDuelPeriodDetails(match) ? match.opponent_recent_periods : [];
  const hasPeriodDetails = mePeriods.length > 0 || opponentPeriods.length > 0;
  const hasMultiplePeriods = match.rules.totalPeriods > 1;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Результат дуэли"
      onClick={onClose}
    >
      <div
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        style={{
          maxHeight: 'calc(100dvh - 64px)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div className="section-label" style={{ margin: 0, padding: 0 }}>
          Результат
        </div>
        <div
          style={{
            marginTop: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <h2 className="modal-title" style={{ margin: 0, fontSize: 26, lineHeight: 1.08 }}>
            {title}
          </h2>
          <span
            aria-hidden="true"
            style={{
              width: 16,
              height: 16,
              borderRadius: 999,
              background: resultColor,
              boxShadow: `0 0 0 5px ${resultColor}24, 0 0 18px ${resultColor}66`,
              flexShrink: 0,
            }}
          />
        </div>
        <div
          aria-label={`Итог дуэли ${match.me.goals}:${match.opponent.goals}`}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 10,
            marginTop: 16,
          }}
        >
          <DailyStatsMetric label="Счёт" value={`${match.me.goals}:${match.opponent.goals}`} />
          <DailyStatsMetric label="Очки" value={pointsText} />
        </div>
        <div
          style={{
            marginTop: 14,
            display: 'grid',
            gap: 8,
          }}
        >
          <DuelResultDetailRow label="Тип" value={duelKindText(match.rules.duelKind)} />
          <DuelResultDetailRow label="Соперник" value={match.opponent.display_name || 'Игрок'} />
          {match.rules.winStarReward > 0 && (
            <DuelResultDetailRow label="Звёзды за победу" value={`+${match.rules.winStarReward}`} />
          )}
          <DuelResultDetailRow label="Начало" value={formatShortDateTime(match.starts_at)} />
        </div>
        <div
          style={{
            marginTop: 16,
            minHeight: 0,
            flex: hasMultiplePeriods ? '1 1 auto' : '0 0 auto',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div className="section-label" style={{ margin: 0, padding: 0 }}>
            Периоды
          </div>
          {hasPeriodDetails ? (
            <div
              style={{
                minHeight: 0,
                flex: hasMultiplePeriods ? '1 1 auto' : undefined,
                maxHeight: hasMultiplePeriods ? 'min(38dvh, 330px)' : undefined,
                overflowY: hasMultiplePeriods ? 'auto' : undefined,
                paddingRight: hasMultiplePeriods ? 2 : 0,
              }}
            >
              <DuelResultPeriodComparison
                totalPeriods={match.rules.totalPeriods}
                mePeriods={mePeriods}
                opponentPeriods={opponentPeriods}
                opponentName={match.opponent.display_name || 'Соперник'}
              />
            </div>
          ) : (
            <div
              style={{
                marginTop: 8,
                borderRadius: 16,
                padding: '12px 14px',
                background: 'rgba(255,255,255,0.42)',
                border: '1px solid rgba(255,255,255,0.62)',
                color: 'rgba(15, 23, 42, 0.58)',
                fontSize: 12,
                fontWeight: 750,
                lineHeight: 1.35,
              }}
            >
              {isLoadingDetails
                ? 'Загружаем статистику периодов...'
                : 'Подробная статистика периодов пока недоступна.'}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="modal-primary btn btn--cta" onClick={onClose}>
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function hasDuelPeriodDetails(match: AmateurDuelMatch): match is AmateurDuelMatchState {
  return 'recent_periods' in match && 'opponent_recent_periods' in match;
}

function DuelResultPeriodComparison({
  totalPeriods,
  mePeriods,
  opponentPeriods,
  opponentName,
}: {
  totalPeriods: number;
  mePeriods: AmateurDuelPeriodLog[];
  opponentPeriods: AmateurDuelPeriodLog[];
  opponentName: string;
}): JSX.Element {
  const meByPeriod = new Map(mePeriods.map((period) => [period.period_number, period]));
  const opponentByPeriod = new Map(opponentPeriods.map((period) => [period.period_number, period]));
  const periodNumbers = Array.from({ length: totalPeriods }, (_, index) => index + 1);
  const hasMultiplePeriods = totalPeriods > 1;
  const [openPeriods, setOpenPeriods] = useState<ReadonlySet<number>>(
    () => new Set(hasMultiplePeriods ? [periodNumbers.at(-1) ?? 1] : periodNumbers),
  );
  const togglePeriod = useCallback((periodNumber: number) => {
    setOpenPeriods((current) => {
      const next = new Set(current);
      if (next.has(periodNumber)) {
        next.delete(periodNumber);
      } else {
        next.add(periodNumber);
      }
      return next;
    });
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
      {periodNumbers.map((periodNumber) => {
        const mePeriod = meByPeriod.get(periodNumber);
        const opponentPeriod = opponentByPeriod.get(periodNumber);
        const isOpen = openPeriods.has(periodNumber);
        const summary = `${mePeriod?.goals ?? 0}:${opponentPeriod?.goals ?? 0}`;

        return (
          <div
            key={periodNumber}
            aria-label={`${periodNumber}-й период: ваша статистика и статистика соперника`}
            style={{
              borderRadius: 16,
              padding: 10,
              background: 'rgba(255,255,255,0.42)',
              border: '1px solid rgba(255,255,255,0.62)',
            }}
          >
            {hasMultiplePeriods ? (
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`duel-result-period-${periodNumber}`}
                onClick={() => togglePeriod(periodNumber)}
                style={{
                  width: '100%',
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto auto',
                  gap: 8,
                  alignItems: 'center',
                  padding: 0,
                  border: 0,
                  background: 'transparent',
                  color: 'var(--ink)',
                  textAlign: 'left',
                  font: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    minWidth: 0,
                    fontSize: 12,
                    fontWeight: 950,
                    lineHeight: 1.1,
                  }}
                >
                  {periodNumber}-й период
                </span>
                <span
                  style={{
                    borderRadius: 999,
                    padding: '5px 9px',
                    background: 'rgba(255,255,255,0.48)',
                    border: '1px solid rgba(255,255,255,0.62)',
                    color: 'var(--ink)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    fontWeight: 850,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {summary}
                </span>
                <ChevronRight
                  size={16}
                  strokeWidth={2.4}
                  aria-hidden="true"
                  style={{
                    color: 'rgba(15,23,42,0.58)',
                    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 140ms ease',
                  }}
                />
              </button>
            ) : (
              <div
                style={{
                  color: 'var(--ink)',
                  fontSize: 12,
                  fontWeight: 950,
                  marginBottom: 8,
                }}
              >
                {periodNumber}-й период
              </div>
            )}
            {isOpen && (
              <div
                id={`duel-result-period-${periodNumber}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 8,
                  marginTop: hasMultiplePeriods ? 8 : 0,
                }}
              >
                <DuelResultParticipantPeriodStats title="Вы" period={mePeriod} />
                <DuelResultParticipantPeriodStats title={opponentName} period={opponentPeriod} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DuelResultParticipantPeriodStats({
  title,
  period,
}: {
  title: string;
  period: AmateurDuelPeriodLog | undefined;
}): JSX.Element {
  const goals = period?.goals ?? 0;
  const shots = period?.shots_taken ?? 0;
  const muted = period === undefined;
  return (
    <div
      style={{
        minWidth: 0,
        borderRadius: 14,
        padding: '9px 8px',
        background: muted ? 'rgba(255,255,255,0.26)' : 'rgba(255,255,255,0.54)',
        border: '1px solid rgba(255,255,255,0.62)',
      }}
    >
      <div
        style={{
          color: muted ? 'rgba(15,23,42,0.38)' : 'rgba(15,23,42,0.72)',
          fontSize: 9,
          fontWeight: 950,
          lineHeight: 1.1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {title}
      </div>
      <div
        style={{
          marginTop: 7,
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '6px 8px',
          color: muted ? 'rgba(15,23,42,0.35)' : 'var(--ink)',
          fontSize: 11,
          fontWeight: 850,
        }}
      >
        <DuelResultTinyStat label="Голы" value={period ? String(goals) : '—'} />
        <DuelResultTinyStat label="Броски" value={period ? String(shots) : '—'} />
        <DuelResultTinyStat label="Процент" value={period ? formatGoalRate(goals, shots) : '—'} />
        <DuelResultTinyStat
          label="Время"
          value={period ? formatDurationMs(period.duration_ms) : '—'}
        />
      </div>
    </div>
  );
}

function DuelResultTinyStat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          color: 'rgba(15,23,42,0.46)',
          fontSize: 8,
          fontWeight: 900,
          lineHeight: 1,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          fontFamily: 'var(--font-mono)',
          fontSize: label === 'Время' ? 10 : 12,
          fontWeight: 850,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function DuelResultDetailRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '82px minmax(0, 1fr)',
        gap: 10,
        alignItems: 'baseline',
        color: 'var(--ink)',
        fontSize: 13,
        fontWeight: 850,
      }}
    >
      <span
        style={{
          color: 'var(--muted)',
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
    </div>
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
    ...(match.rules.breakDurationMs > 0
      ? [`перерыв ${formatMs(match.rules.breakDurationMs)}`]
      : []),
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

function DuelInventorySlots({ match }: { match: AmateurDuelMatch }): JSX.Element {
  const items = match.me.loadout.items;
  const availableItems = match.me.inventory_available ?? [];
  const iconSize = 42;

  return (
    <div
      aria-label={items.length > 0 ? 'Инвентарь дуэли' : 'Инвентарь дуэли: ничего не выбрано'}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 8,
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
              minHeight: 98,
              borderRadius: 12,
              padding: '9px',
              display: 'grid',
              gridTemplateColumns: '1fr',
              gridTemplateRows: `${iconSize}px auto`,
              gap: 7,
              alignItems: 'center',
              justifyItems: 'center',
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
            <div style={{ minWidth: 0, width: '100%', textAlign: 'center' }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  lineHeight: 1.08,
                  whiteSpace: 'normal',
                  overflow: 'visible',
                  textOverflow: 'clip',
                  overflowWrap: 'anywhere',
                }}
              >
                {item?.title ?? slot.label}
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: 11,
                  fontWeight: 900,
                  lineHeight: 1.08,
                  whiteSpace: 'normal',
                  overflow: 'visible',
                  textOverflow: 'clip',
                  overflowWrap: 'anywhere',
                }}
              >
                {item ? `${item.chargesReserved} зар.` : emptyText}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function duelInventoryRarityColor(
  rarity: AmateurDuelMatch['me']['loadout']['items'][number]['rarity'] | undefined,
): string {
  return rarity === 'legendary'
    ? '#f59e0b'
    : rarity === 'epic'
      ? '#a855f7'
      : rarity === 'rare'
        ? '#0ea5e9'
        : '#64748b';
}

function duelInventoryRemaining(match: AmateurDuelMatch, itemId: string, fallback: number): number {
  for (let index = match.me.inventory_report.length - 1; index >= 0; index -= 1) {
    const report = match.me.inventory_report[index];
    const consumed = report?.consumed.find((cur) => cur.id === itemId);
    if (consumed) return consumed.remainingReserved;
  }
  return fallback;
}

function DuelInventoryMiniHud({ match }: { match: AmateurDuelMatch }): JSX.Element | null {
  const availableItems = match.me.inventory_available ?? [];

  return (
    <div
      aria-label="Инвентарь дуэли"
      style={{
        display: 'flex',
        justifyContent: 'flex-start',
        gap: 5,
        pointerEvents: 'none',
      }}
    >
      {DUEL_INVENTORY_SLOTS.map((slot) => {
        const item = match.me.loadout.items.find((cur) => cur.kind === slot.kind);
        const available = availableItems.find(
          (cur) => cur.kind === slot.kind && cur.chargesAvailable > 0,
        );
        const totalCharges = item?.chargesReserved ?? 0;
        const remainingCharges = item
          ? duelInventoryRemaining(match, item.id, item.chargesReserved)
          : 0;
        const remainingRatio =
          item && totalCharges > 0
            ? Math.max(0, Math.min(1, remainingCharges / totalCharges))
            : item
              ? 1
              : 0;
        const usedPercent = Math.round((1 - remainingRatio) * 100);
        const rarityColor = duelInventoryRarityColor(item?.rarity ?? available?.rarity);
        const isSelected = item !== undefined;
        const lineVisible = isSelected && usedPercent > 0 && usedPercent < 100;
        const statusText = isSelected
          ? totalCharges > 0
            ? `${remainingCharges}/${totalCharges}`
            : 'вкл'
          : available
            ? 'не выбрано'
            : 'нет';

        return (
          <span
            key={slot.kind}
            aria-label={`${slot.label}: ${statusText}`}
            style={{
              position: 'relative',
              width: 27,
              height: 27,
              borderRadius: 999,
              overflow: 'hidden',
              display: 'block',
              background: 'rgba(255,255,255,0.72)',
              border: isSelected ? `2px solid ${rarityColor}` : '1px solid rgba(255,255,255,0.78)',
              boxShadow: isSelected
                ? `0 0 0 1px rgba(255,255,255,0.72), 0 6px 14px ${rarityColor}42`
                : '0 0 0 1px rgba(15,23,42,0.08), 0 5px 12px rgba(15,23,42,0.12)',
            }}
          >
            <img
              src={slot.artwork}
              alt=""
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: 'grayscale(1)',
                opacity: isSelected ? 0.52 : available ? 0.46 : 0.28,
              }}
            />
            {isSelected && (
              <img
                src={slot.artwork}
                alt=""
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  clipPath: `inset(${usedPercent}% 0 0 0)`,
                  opacity: 0.98,
                }}
              />
            )}
            {lineVisible && (
              <span
                style={{
                  position: 'absolute',
                  left: 4,
                  right: 4,
                  top: `${usedPercent}%`,
                  height: 1,
                  background: 'rgba(255,255,255,0.92)',
                  boxShadow: '0 0 0 1px rgba(15,23,42,0.16)',
                  transform: 'translateY(-0.5px)',
                }}
              />
            )}
          </span>
        );
      })}
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
  playEntranceOnMount?: boolean | undefined;
  onEntranceConsumed?: (() => void) | undefined;
  playRouteTransitionOnMount?: boolean | undefined;
  onRouteTransitionConsumed?: (() => void) | undefined;
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

const PERSPECTIVE_PLAYER_OPTIONS: PlayerOptions = {
  spriteUrls: {
    left: '/sprites/ultimate-player-left.webp',
    right: '/sprites/ultimate-player-right.webp',
  },
  shotSpriteUrls: {
    left: '/sprites/ultimate-player-left-shoot.webp',
    right: '/sprites/ultimate-player-right-shoot.webp',
  },
  spriteWidth: 101,
  spriteAspect: 942 / 1067,
  baseRotation: 0,
  shotMaxRotation: 0,
  shotDurationMs: 500,
  visualYScale: TRAINING_NEW_COURT_VISUAL_Y_SCALE,
  visualYOffset: TRAINING_NEW_COURT_VISUAL_Y_OFFSET,
  shadow: true,
};

const PERSPECTIVE_GOAL_OPTIONS: GoalOptions = {
  spriteUrl: '/sprites/test-goal-clean.webp',
  gateWidth: 92,
  gateAspect: 1097 / 734,
  visualYScale: TRAINING_NEW_COURT_VISUAL_Y_SCALE,
  visualYOffset: TRAINING_NEW_COURT_GOAL_VISUAL_Y_OFFSET,
  visualOffsetXScale: TRAINING_NEW_COURT_GOAL_VISUAL_OFFSET_X_SCALE,
  spriteAnchorY: 1,
};

const PERSPECTIVE_GOALIE_OPTIONS: GoalieOptions = {
  idleSpriteUrl: '/sprites/test-goalie-black.webp',
  saveSpriteUrl: '/sprites/test-goalie-black-save.webp',
  visualYScale: TRAINING_NEW_COURT_VISUAL_Y_SCALE,
  visualYOffset: TRAINING_NEW_COURT_GOALIE_VISUAL_Y_OFFSET,
  visualXScale: TRAINING_NEW_COURT_GOALIE_VISUAL_X_SCALE,
  sizeScale: 1.134,
  idleSizeScale: 1.22,
  saveSizeScale: 0.96,
  saveVisualYOffset: 10,
  shadow: true,
};

const PERSPECTIVE_PUCK_OPTIONS: PuckOptions = {
  radiusScaleX: 1.16,
  radiusScaleY: 0.82,
  rotation: 0,
  visualYScale: TRAINING_NEW_COURT_VISUAL_Y_SCALE,
  visualYOffset: TRAINING_NEW_COURT_VISUAL_Y_OFFSET,
  bladeOffsetX: TRAINING_NEW_COURT_PUCK_BLADE_OFFSET_X,
  bladeOffsetY: TRAINING_NEW_COURT_PUCK_BLADE_OFFSET_Y,
  flightVisualYOffset: TRAINING_NEW_COURT_PUCK_FLIGHT_VISUAL_Y_OFFSET,
};

const PERSPECTIVE_HITBOX_OPTIONS: HitboxesOptions = {
  goalWidthScale: TRAINING_NEW_COURT_HITBOX_GOAL_WIDTH_SCALE,
  goalHeightScale: TRAINING_NEW_COURT_HITBOX_GOAL_HEIGHT_SCALE,
  goalInset: TRAINING_NEW_COURT_HITBOX_GOAL_INSET,
  goalieWidthScale: TRAINING_NEW_COURT_HITBOX_GOALIE_WIDTH_SCALE,
  goalieHeightScale: TRAINING_NEW_COURT_HITBOX_GOALIE_HEIGHT_SCALE,
  goalieInset: TRAINING_NEW_COURT_HITBOX_GOALIE_INSET,
};

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

function DailyPlayView({
  onBack,
  playEntranceOnMount = false,
  onEntranceConsumed,
  playRouteTransitionOnMount = false,
  onRouteTransitionConsumed,
}: {
  onBack: () => void;
  playEntranceOnMount?: boolean;
  onEntranceConsumed?: () => void;
  playRouteTransitionOnMount?: boolean;
  onRouteTransitionConsumed?: (() => void) | undefined;
}): JSX.Element {
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
  const rawCanStartPeriod = data.state === 'idle' && data.current_period < data.total_periods;
  const periodNumber = isBreak
    ? Math.min(data.current_period + 1, data.total_periods)
    : data.state === 'period_active'
      ? data.current_period || 1
      : rawCanStartPeriod
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
  const trainingCooldownEndsAt = data.training_cooldown_ends_at
    ? new Date(data.training_cooldown_ends_at).getTime()
    : 0;
  const trainingCooldownRemaining = Math.max(0, trainingCooldownEndsAt - now);
  const isDailyLockedByTraining =
    rawCanStartPeriod && trainingCooldownEndsAt > 0 && trainingCooldownRemaining > 0;
  const canStartPeriod = rawCanStartPeriod && !isDailyLockedByTraining;
  const shouldSuppressRink = data.state !== 'period_active' || hasStatsModal;
  const shouldShowIceCar = isBreak || isClosed || hasStatsModal || isDailyLockedByTraining;

  useEffect(() => {
    if ((!isBreak || !breakEndsAt) && !isClosed && !isDailyLockedByTraining) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [breakEndsAt, isBreak, isClosed, isDailyLockedByTraining]);

  const breakRemaining = breakEndsAt ? Math.max(0, breakEndsAt - now) : 0;
  const nextDayAt = new Date(data.next_day_starts_at).getTime();
  const nextDayRemaining = Math.max(0, nextDayAt - now);

  useEffect(() => {
    if (isBreak && breakEndsAt && breakRemaining === 0) void refresh();
    if (isClosed && nextDayAt > 0 && nextDayRemaining === 0) void refresh();
    if (isDailyLockedByTraining && trainingCooldownEndsAt > 0 && trainingCooldownRemaining === 0) {
      void refresh();
    }
  }, [
    breakEndsAt,
    breakRemaining,
    isBreak,
    isClosed,
    nextDayAt,
    nextDayRemaining,
    isDailyLockedByTraining,
    trainingCooldownEndsAt,
    trainingCooldownRemaining,
    refresh,
  ]);

  return (
    <>
      <PlayView<DailyStateResponse>
        suppressedByModal={shouldSuppressRink}
        showIceCar={shouldShowIceCar}
        playEntranceOnMount={data.state === 'period_active' ? playEntranceOnMount : false}
        onEntranceConsumed={onEntranceConsumed}
        playRouteTransitionOnMount={playRouteTransitionOnMount}
        onRouteTransitionConsumed={onRouteTransitionConsumed}
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
              : isDailyLockedByTraining
                ? formatHms(trainingCooldownRemaining)
                : data.state === 'idle'
                  ? '20:00'
                  : undefined
        }
        timerLabel={
          isBreak
            ? 'ПЕРЕРЫВ'
            : isClosed
              ? 'ДО ОБНОВЛЕНИЯ'
              : isDailyLockedByTraining
                ? 'ДО ИГРЫ'
                : undefined
        }
        shotButtonLabel={
          isBreak || isDailyLockedByTraining
            ? 'ЛЁД ГОТОВИТСЯ'
            : isClosed
              ? 'ИГРА ЗАВЕРШЕНА'
              : undefined
        }
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
    </>
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
      aria-label="Игровая площадка в перспективе"
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

function TrainingPlayView({
  onBack,
  playEntranceOnMount = false,
  onEntranceConsumed,
  playRouteTransitionOnMount = false,
  onRouteTransitionConsumed,
}: {
  onBack: () => void;
  playEntranceOnMount?: boolean;
  onEntranceConsumed?: () => void;
  playRouteTransitionOnMount?: boolean;
  onRouteTransitionConsumed?: (() => void) | undefined;
}): JSX.Element | null {
  const data = useTrainingSessionStore((s) => s.data);
  const optimisticAddShot = useTrainingSessionStore((s) => s.optimisticAddShot);
  const submitShot = useTrainingSessionStore((s) => s.submitShot);
  const applyState = useTrainingSessionStore((s) => s.applyState);
  const userRole = useAuthStore((s) => s.user?.role);
  const experimentalTrainingCourt = useAuthStore((s) => s.user?.experimentalTrainingCourt);
  const [hitboxesVisible, setHitboxesVisible] = useState(() => readTrainingHitboxesVisible());
  const [now, setNow] = useState(Date.now());
  const canSwitchCourtDesign = userRole === 'admin' || experimentalTrainingCourt === true;
  const handleHitboxesChange = useCallback((next: boolean): void => {
    setHitboxesVisible(next);
    saveTrainingHitboxesVisible(next);
  }, []);

  useEffect(() => {
    if (data?.state !== 'closed') return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [data?.state]);

  if (!data) return null;

  const isTrainingActive = data.state === 'active';
  const isTrainingClosed = data.state === 'closed';
  const nextDayAt = new Date(data.next_day_starts_at).getTime();
  const nextDayRemaining = Math.max(0, nextDayAt - now);
  const trainingTimer = isTrainingClosed
    ? formatHms(nextDayRemaining)
    : isTrainingActive
      ? String(data.shots_limit)
      : '--:--';
  const trainingTimerLabel = isTrainingClosed
    ? 'ДО ОБНОВЛЕНИЯ'
    : isTrainingActive
      ? 'ЛИМИТ'
      : 'НЕДОСТУПНО';

  return (
    <>
      {canSwitchCourtDesign ? (
        <TrainingHitboxesToggle checked={hitboxesVisible} onChange={handleHitboxesChange} />
      ) : null}
      <PlayView<TrainingStateResponse>
        suppressedByModal={!isTrainingActive}
        showIceCar={!isTrainingActive}
        playEntranceOnMount={isTrainingActive ? playEntranceOnMount : false}
        onEntranceConsumed={onEntranceConsumed}
        playRouteTransitionOnMount={playRouteTransitionOnMount}
        onRouteTransitionConsumed={onRouteTransitionConsumed}
        onBack={onBack}
        active={isTrainingActive}
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
        timer={trainingTimer}
        timerLabel={trainingTimerLabel}
        shotButtonLabel={isTrainingActive ? undefined : 'ЛЁД ГОТОВИТСЯ'}
        backLabel="К тренировке"
        optimisticAddShot={optimisticAddShot}
        submitShot={submitShot}
        applyState={applyState}
        hitboxesVisible={hitboxesVisible}
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
  playEntranceOnMount = false,
  onEntranceConsumed,
  playRouteTransitionOnMount = false,
  onRouteTransitionConsumed,
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
  bottomInset = 'calc(8px + max(20px, var(--app-safe-bottom)))',
  sessionStartedAt,
  serverNow,
  receivedAtPerformanceMs,
  periodEndsAt,
  onTimerExpired,
  optimisticAddShot,
  submitShot,
  applyState,
  applyResolvedState,
  rinkLayer = <TrainingPerspectiveRink />,
  rinkAspectRatio = '1024 / 1428',
  rinkBorderRadius = 36,
  rinkBorder = '3px solid #1e3a5f',
  gameLayerStyle,
  playerGrip,
  playerOptions = PERSPECTIVE_PLAYER_OPTIONS,
  goalOptions = PERSPECTIVE_GOAL_OPTIONS,
  goalieOptions = PERSPECTIVE_GOALIE_OPTIONS,
  puckOptions = PERSPECTIVE_PUCK_OPTIONS,
  hitboxesVisible = false,
  hitboxesOptions = PERSPECTIVE_HITBOX_OPTIONS,
  shotResolver = resolveNewTrainingCourtShot,
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
  const playRootRef = useRef<HTMLElement | null>(null);
  const scoreboardShellRef = useRef<HTMLDivElement | null>(null);
  const rinkAreaRef = useRef<HTMLDivElement | null>(null);
  const rinkShellRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const loopRef = useRef<GameLoop | null>(null);
  const puckRef = useRef<Puck | null>(null);
  const playerRef = useRef<Player | null>(null);
  const goalRef = useRef<Goal | null>(null);
  const goalieRef = useRef<Goalie | null>(null);
  const hitboxesRef = useRef<Hitboxes | null>(null);
  const refreshRef = useRef<((s: Scale) => void) | null>(null);
  const tickerRef = useRef<Ticker | null>(null);
  const entranceRafRef = useRef<number | null>(null);
  const routeCameraRafRef = useRef<number | null>(null);
  const routeBackTimeoutRef = useRef<number | null>(null);
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
  const [resultDisplayKind, setResultDisplayKind] = useState<ResultModalKind | null>(null);
  const [lastResult, setLastResult] = useState<ShotResult | null>(null);
  const [playLayout, setPlayLayout] = useState<{
    rinkWidth: number;
    rinkHeight: number;
    rinkSlotHeight: number;
    bottomSpace: number;
  } | null>(null);
  // Server state is held until shot animation ends, so ScoreBoard counters
  // don't jump while the puck is still flying.
  const pendingMidShotApplyRef = useRef<(() => void) | null>(null);
  const [pixiReady, setPixiReady] = useState(false);
  const [isEntrancePlaying, setIsEntrancePlaying] = useState(false);
  const routeCameraRequestedRef = useRef(playRouteTransitionOnMount && !shouldReduceMotion());
  const [routeCameraPhase, setRouteCameraPhase] = useState<RouteCameraPhase>(() =>
    routeCameraRequestedRef.current ? 'zoomed' : 'settled',
  );
  // Ref-mirror of suppressedByModal so handleReady (initialized once via
  // useCallback) can read the latest value when Pixi finishes loading.
  const suppressedRef = useRef(suppressedByModal);
  suppressedRef.current = suppressedByModal;
  const showIceCarRef = useRef(showIceCar);
  showIceCarRef.current = showIceCar;
  const playEntranceOnMountRef = useRef(playEntranceOnMount);
  playEntranceOnMountRef.current = playEntranceOnMount;
  const onEntranceConsumedRef = useRef(onEntranceConsumed);
  onEntranceConsumedRef.current = onEntranceConsumed;
  const onRouteTransitionConsumedRef = useRef(onRouteTransitionConsumed);
  onRouteTransitionConsumedRef.current = onRouteTransitionConsumed;
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
  const rinkRatio = useMemo(() => parseAspectRatio(rinkAspectRatio), [rinkAspectRatio]);
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

  useEffect(() => {
    if (!playRouteTransitionOnMount || routeCameraRequestedRef.current) return;
    onRouteTransitionConsumedRef.current?.();
  }, [playRouteTransitionOnMount]);

  useEffect(() => {
    if (routeCameraPhase !== 'zoomed') return undefined;
    onRouteTransitionConsumedRef.current?.();

    const settle = (): void => {
      setRouteCameraPhase('settled');
      routeCameraRafRef.current = null;
    };
    let fallbackId: number | null = window.setTimeout(settle, 160);
    if (playLayout) {
      routeCameraRafRef.current = window.requestAnimationFrame(() => {
        routeCameraRafRef.current = window.requestAnimationFrame(settle);
      });
    }

    return () => {
      if (fallbackId !== null) {
        window.clearTimeout(fallbackId);
        fallbackId = null;
      }
      if (routeCameraRafRef.current !== null) {
        window.cancelAnimationFrame(routeCameraRafRef.current);
        routeCameraRafRef.current = null;
      }
    };
  }, [playLayout, routeCameraPhase]);

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

  useLayoutEffect(() => {
    const root = playRootRef.current;
    const node = rinkAreaRef.current;
    const scoreboard = scoreboardShellRef.current;
    const controls = controlsRef.current;
    if (!root || !node || !scoreboard || !controls) return undefined;

    const updatePlayLayout = (): void => {
      const rootRect = root.getBoundingClientRect();
      const rinkAreaRect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const maxWidth = Math.max(0, rinkAreaRect.width - paddingX);
      if (maxWidth <= 0 || rootRect.height <= 0) return;

      const nav = document.querySelector<HTMLElement>('.bottom-nav-shell nav');
      const navReserve = nav ? Math.max(54, rootRect.bottom - nav.getBoundingClientRect().top) : 0;
      const minBottomSpace = navReserve + 6;
      const preferredBottomSpace = navReserve + (navReserve > 0 ? 24 : 14);
      const fixedHeight = outerBlockHeight(scoreboard) + outerBlockHeight(controls);
      const availableForRinkAndBottom = Math.max(0, rootRect.height - fixedHeight);
      const fullWidthRinkHeight = maxWidth / rinkRatio;
      const spareAfterFullRink = availableForRinkAndBottom - fullWidthRinkHeight;
      const bottomSpace = Math.min(
        preferredBottomSpace,
        Math.max(minBottomSpace, spareAfterFullRink),
      );
      const rinkSlotHeight = Math.max(0, availableForRinkAndBottom - bottomSpace);
      const rinkWidth = Math.min(maxWidth, rinkSlotHeight * rinkRatio);
      const rinkHeight = rinkWidth / rinkRatio;

      setPlayLayout((prev) => {
        if (
          prev &&
          Math.abs(prev.rinkWidth - rinkWidth) < 0.5 &&
          Math.abs(prev.rinkHeight - rinkHeight) < 0.5 &&
          Math.abs(prev.rinkSlotHeight - rinkSlotHeight) < 0.5 &&
          Math.abs(prev.bottomSpace - bottomSpace) < 0.5
        ) {
          return prev;
        }
        return { rinkWidth, rinkHeight, rinkSlotHeight, bottomSpace };
      });
    };

    updatePlayLayout();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(updatePlayLayout);
      observer.observe(root);
      observer.observe(node);
      observer.observe(scoreboard);
      observer.observe(controls);
    }
    window.addEventListener('resize', updatePlayLayout);
    window.visualViewport?.addEventListener('resize', updatePlayLayout);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updatePlayLayout);
      window.visualViewport?.removeEventListener('resize', updatePlayLayout);
    };
  }, [rinkRatio]);

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
      if (routeCameraRafRef.current !== null) {
        cancelAnimationFrame(routeCameraRafRef.current);
        routeCameraRafRef.current = null;
      }
      if (routeBackTimeoutRef.current !== null) {
        window.clearTimeout(routeBackTimeoutRef.current);
        routeBackTimeoutRef.current = null;
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

  const startEntranceAnimation = useCallback((loop: GameLoop, ticker: Ticker): void => {
    if (entranceRafRef.current !== null) {
      cancelAnimationFrame(entranceRafRef.current);
      entranceRafRef.current = null;
    }
    const goal = goalRef.current;
    const player = playerRef.current;
    const goalie = goalieRef.current;
    const puck = puckRef.current;
    if (!goal || !player || !goalie || !puck) return;

    loop.detach();
    setIsEntrancePlaying(true);

    const ENTRY_DURATION_MS = 1400;
    const CENTER_RED_Y = 350;
    const ENTRY_X = RINK.width + 50;
    const goalieStartX = ENTRY_X;
    const goalieStartY = CENTER_RED_Y - 30;
    const playerStartX = ENTRY_X;
    const playerStartY = CENTER_RED_Y + 30;
    const goalStartOffsetY = -140;
    const t0 = performance.now();

    goal.container.visible = true;
    player.container.visible = true;
    goalie.container.visible = true;
    puck.container.visible = false;

    const drawAt = (gx: number, gy: number, px: number, py: number, goalOffsetY: number): void => {
      goal.update(scaleRef.current, 0, goalOffsetY);
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

    drawAt(goalieStartX, goalieStartY, playerStartX, playerStartY, goalStartOffsetY);

    const step = (): void => {
      if (!mountedRef.current) return;
      const t = Math.min(1, (performance.now() - t0) / ENTRY_DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      drawAt(
        goalieStartX + (SHOOTER_CENTER_X - goalieStartX) * eased,
        goalieStartY + (GOALIE_Y - goalieStartY) * eased,
        playerStartX + (SHOOTER_CENTER_X - playerStartX) * eased,
        playerStartY + (PUCK_START.y - playerStartY) * eased,
        goalStartOffsetY * (1 - eased),
      );
      if (t < 1) {
        entranceRafRef.current = requestAnimationFrame(step);
        return;
      }
      entranceRafRef.current = null;
      goal.update(scaleRef.current, 0, 0);
      puck.container.visible = true;
      loop.resetTime();
      loop.attach(ticker);
      setIsEntrancePlaying(false);
    };

    entranceRafRef.current = requestAnimationFrame(step);
  }, []);

  const handleReady = useCallback(
    (app: Application, initialScale: Scale): void => {
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
      const grip = playerGripRef.current ?? useAuthStore.getState().user?.grip ?? 'right';
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
        if (playEntranceOnMountRef.current && sessionRef.current.active) {
          onEntranceConsumedRef.current?.();
          startEntranceAnimation(loop, app.ticker);
        } else {
          loop.attach(app.ticker);
        }
      }
      setPixiReady(true);
    },
    [startEntranceAnimation],
  );

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
      setIsEntrancePlaying(false);
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
    startEntranceAnimation(loop, ticker);
    return () => {
      if (entranceRafRef.current !== null) {
        cancelAnimationFrame(entranceRafRef.current);
        entranceRafRef.current = null;
        setIsEntrancePlaying(false);
      }
      if (iceCarRafRef.current !== null) {
        cancelAnimationFrame(iceCarRafRef.current);
        iceCarRafRef.current = null;
      }
    };
  }, [suppressedByModal, showIceCar, pixiReady, startEntranceAnimation]);

  const handleResize = useCallback((s: Scale): void => {
    refreshRef.current?.(s);
  }, []);

  const handleBackTap = useCallback((): void => {
    if (routeBackTimeoutRef.current !== null) return;
    if (shouldReduceMotion()) {
      onBack();
      return;
    }
    const rect = rinkShellRef.current?.getBoundingClientRect();
    if (rect) saveArenaReturnFrame(rect);
    routeBackTimeoutRef.current = window.setTimeout(() => {
      routeBackTimeoutRef.current = null;
      onBack();
    }, 30);
  }, [onBack]);

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
    let displayKind: ResultModalKind = result.type;
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
      const dist = distanceToNewTrainingCourtGoalEdge(sx, goalOffsetAtCross);
      if (dist <= TRAINING_NEW_COURT_POST_EDGE_DISTANCE) displayKind = 'post';
      subText =
        displayKind === 'post'
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
      setLastResult(result);
      setResultSubText(subText);
      setResultDisplayKind(displayKind);
      setIsShowingResult(true);
    }, flightDurationMs);

    scheduleShotTimeout(() => {
      loop.endScenePause();
      loop.endShooterPause();
      puck.release();
      if (result.type === 'save') goalie.setSavePose(false);
      setIsShowingResult(false);
      setResultDisplayKind(null);
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
  const routeCameraEase = 'cubic-bezier(.16,.84,.24,1)';
  const routeCameraTransition = `transform ${PLAY_ROUTE_TRANSITION_MS}ms ${routeCameraEase}, filter ${PLAY_ROUTE_TRANSITION_MS}ms ${routeCameraEase}, border-color ${PLAY_ROUTE_TRANSITION_MS}ms ease`;
  const routeChromeTransition =
    routeCameraPhase === 'zoomed'
      ? `opacity 280ms ease 220ms, transform 420ms cubic-bezier(.16,.84,.24,1) 160ms`
      : 'opacity 280ms ease, transform 420ms cubic-bezier(.16,.84,.24,1)';
  const routeGameTransition =
    routeCameraPhase === 'zoomed' ? 'opacity 300ms ease 260ms' : 'opacity 300ms ease';
  const isRouteCameraZoomed = routeCameraPhase === 'zoomed' || routeCameraPhase === 'exiting';
  const routeChromeStyle: CSSProperties = {
    opacity: isRouteCameraZoomed ? 0 : 1,
    transform: isRouteCameraZoomed ? 'translate3d(0, 12px, 0)' : 'translate3d(0, 0, 0)',
    transition: routeChromeTransition,
    willChange: isRouteCameraZoomed ? 'opacity, transform' : 'auto',
  };
  const routeRinkStyle: CSSProperties = {
    transform: isRouteCameraZoomed
      ? 'translate3d(0, -2.5%, 0) scale(1.62)'
      : 'translate3d(0, 0, 0) scale(1)',
    transformOrigin: '50% 58%',
    transition: routeCameraTransition,
    filter: isRouteCameraZoomed ? 'blur(0.5px) saturate(1.03)' : 'none',
    willChange: isRouteCameraZoomed ? 'transform, filter' : 'auto',
  };
  const routeGameStyle: CSSProperties = {
    opacity: isRouteCameraZoomed ? 0 : 1,
    transition: routeGameTransition,
    willChange: isRouteCameraZoomed ? 'opacity' : 'auto',
  };

  return (
    <main
      ref={playRootRef}
      className="screen"
      style={{
        position: 'fixed',
        top: 'calc(var(--app-safe-top) + 6px)',
        left: 0,
        right: 0,
        bottom: bottomInset,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div
        ref={scoreboardShellRef}
        style={{
          margin: '12px 14px 10px',
          ...routeChromeStyle,
        }}
      >
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
      </div>

      <div
        ref={rinkAreaRef}
        style={{
          flex: playLayout ? `0 0 ${playLayout.rinkSlotHeight}px` : '1 1 auto',
          height: playLayout ? `${playLayout.rinkSlotHeight}px` : undefined,
          minHeight: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '0 14px 8px',
        }}
      >
        <div
          ref={rinkShellRef}
          style={{
            position: 'relative',
            aspectRatio: rinkAspectRatio,
            width: playLayout ? `${playLayout.rinkWidth}px` : '100%',
            height: playLayout ? `${playLayout.rinkHeight}px` : undefined,
            maxWidth: '100%',
            flex: '0 0 auto',
            borderRadius: rinkBorderRadius,
            overflow: 'hidden',
            border: isRouteCameraZoomed ? '3px solid rgba(30, 58, 95, 0)' : rinkBorder,
            background: '#EAF1F8',
            ...routeRinkStyle,
          }}
        >
          {rinkLayer}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              ...gameLayerStyle,
              ...routeGameStyle,
            }}
          >
            <PixiStage onReady={handleReady} onResize={handleResize} />
          </div>
          {hudAddon && (
            <div
              style={{
                position: 'absolute',
                left: 'clamp(10px, 4.2%, 22px)',
                bottom: 'clamp(16px, 3.4%, 30px)',
                zIndex: 6,
                maxWidth: '34%',
                pointerEvents: 'none',
                ...routeGameStyle,
              }}
            >
              {hudAddon}
            </div>
          )}
        </div>
      </div>

      <div
        ref={controlsRef}
        style={{
          padding: '0 14px 10px',
          display: 'grid',
          gridTemplateColumns: '56px minmax(0, 1fr) 56px',
          gap: 10,
          alignItems: 'center',
          width: '100%',
          maxWidth: 344,
          margin: '0 auto',
          ...routeChromeStyle,
        }}
      >
        <button
          type="button"
          aria-label={backLabel}
          title={backLabel}
          onClick={handleBackTap}
          className="icon-btn icon-btn--dark"
          disabled={isRouteCameraZoomed}
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
            isRouteCameraZoomed ||
            isEntrancePlaying ||
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

      <div
        aria-hidden="true"
        style={{
          flex: playLayout ? `0 0 ${playLayout.bottomSpace}px` : '0 1 88px',
          minHeight: 0,
        }}
      />

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
        <ResultModal
          result={lastResult}
          durationMs={PAUSE_MS}
          subText={resultSubText}
          displayKind={resultDisplayKind ?? undefined}
        />
      )}
    </main>
  );
}
