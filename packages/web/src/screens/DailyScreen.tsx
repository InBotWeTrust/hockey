import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronRight,
  Crosshair,
  Info,
  Search,
  SlidersHorizontal,
  Swords,
  X,
} from 'lucide-react';
import {
  DEFAULT_DUEL_INVENTORY_TIMING,
  SHOOTER_AMPLITUDE,
  getDuelPlayerCondition,
  type DailyPeriodSpeedPreset,
  type DuelInventoryLoadoutSnapshot,
  type DuelPlayerCondition,
} from '@hockey/game-core';
import type { SpeedOverrides } from '../game/loop.js';
import {
  PlayView,
  TRAINING_AMATEUR_GOALIE_OPTIONS,
  TRAINING_STREET_PLAYER_OPTIONS,
  clampPuckSpeed,
  computeInitialElapsedMs,
  formatMs,
  periodSpeedPresetFor,
  speedOverridesForPeriod,
  type ReadyPresence,
} from '../game/PlayView.js';
import { TelegramLoginButton, type TelegramAuthPayload } from '../auth/TelegramLoginButton.js';
import { useAuthStore, type AuthSession } from '../auth/authStore.js';
import { startVkOAuth } from '../auth/vkAuth.js';
import { detectTimezone } from '../auth/timezone.js';
import { apiFetch, ApiError } from '../api/apiFetch.js';
import { useDailyStore } from '../stores/dailyStore.js';
import { useClassicTournamentStore } from '../stores/classicTournamentStore.js';
import {
  fetchActiveClassicTournamentGames,
  type ActiveClassicTournamentGame,
  type ClassicTournamentState,
} from '../api/tournamentClassic.js';
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
import { rewardColor } from '../app/rewardColors.js';
import type { ScoreBoardOpponent } from '../components/ScoreBoard.js';
import { GlassSelect } from '../components/GlassSelect.js';
import { SegmentedTabs } from '../components/SegmentedTabs.js';
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
import { fetchBonusGames } from '../api/bonusGames.js';
import type { ProfileData } from './profileTypes.js';
import {
  fetchMyInventory,
  patchEquipment,
  type InventoryEquipmentKind,
  type InventoryItem,
  type InventoryState,
} from '../api/inventory.js';
import {
  challengeAmateurDuel,
  acceptAmateurDuel,
  cancelAmateurDuel,
  declineAmateurDuel,
  fetchAmateurEvents,
  fetchAmateurHistory,
  fetchAmateurMatch,
  fetchAmateurMatches,
  fetchAmateurRating,
  fetchAmateurTemplates,
  joinAmateurMatchmaking,
  leaveAmateurMatchmaking,
  searchAmateurOpponents,
  settleAmateurDuel,
  type AmateurDuelKind,
  type AmateurDuelInventoryAvailabilityItem,
  type AmateurDuelLoadoutItem,
  type AmateurDuelLoadoutSelection,
  type AmateurDuelMatch,
  type AmateurDuelMatchState,
  type AmateurDuelParticipantState,
  type AmateurDuelPeriodLog,
  type AmateurDuelPeriodRule,
  type AmateurDuelTemplate,
  type AmateurOpponent,
} from '../api/amateurDuel.js';
import { StartPeriodModal } from '../components/StartPeriodModal.js';
import { getLastSeenAt, setLastSeenAt } from '../stores/seenPeriods.js';
import { TournamentCatalog } from '../tournament/TournamentCatalog.js';
import { VenueBadge, type VenueRole } from '../components/VenueBadge.js';
import { artworkForInventoryItem, placeholderArtworkForKind } from './inventoryArtwork.js';
import {
  formatInventoryBadgeAmount,
  formatInventoryResourceAmount,
  formatInventoryStockLabel,
} from './inventoryResourceLabels.js';
const HUB_PERIOD_DURATION_MS = 20 * 60 * 1000;

type GameLevel = 'beginner' | 'amateur' | 'pro';
type BeginnerMode = 'daily' | 'training';
type DailyView = 'arena' | 'play';
type AmateurView = 'hub' | 'duels' | 'tournaments';
type AmateurDuelTab = 'game' | 'locker' | 'rating' | 'history';
type DuelHistoryFilter = 'current' | 'all' | string;
type ModeInfoModalContent = { title: string; text: string };
type ArenaEntryKind = 'daily' | 'training' | 'duel' | 'classic';
interface ArenaEntry {
  id: string;
  kind: ArenaEntryKind;
  eyebrow: string;
  title: string;
  subtitle: string;
  meta: string;
  ctaLabel: string;
  disabled?: boolean;
  scoreboard?: JSX.Element;
  opponentName?: string;
  opponentAvatarUrl?: string | null;
  typeLabel?: string;
  venueRole?: VenueRole;
  secondaryActions?: ReactNode;
  onEnter: () => void;
}

const DUEL_KIND_ARTWORK_IMAGES: Record<AmateurDuelKind, string> = {
  express: '/modes/amateur-duel-steal-clean.webp',
  express_plus: '/modes/amateur-duel-card.webp',
  classic: '/modes/amateur-duel.webp',
};
const TRAINING_HITBOX_TOGGLE_STORAGE_KEY = 'hockey.trainingHitboxesVisible';
const TRAINING_SPEED_OVERRIDES_STORAGE_KEY = 'hockey.trainingSpeedOverrides';
const OPPONENT_ONLINE_WINDOW_MS = 2 * 60 * 1000;
const OPPONENT_RECENT_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_AMATEUR_UNLOCK_GOALS_REQUIRED = 1000;
const DUEL_INTERMISSION_CONTINUE_GRACE_MS = 5 * 60 * 1000;
const ARENA_SELECTED_ENTRY_STORAGE_KEY = 'hockey.arenaSelectedEntryId';

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

function readTrainingHitboxesVisible(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(TRAINING_HITBOX_TOGGLE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function clampFrequency(value: number): number {
  return Math.min(3, Math.max(0.1, Number(value.toFixed(3))));
}

function readTrainingSpeedOverrides(): SpeedOverrides | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(TRAINING_SPEED_OVERRIDES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Record<keyof SpeedOverrides, unknown>>;
    if (
      typeof parsed.goalFreq !== 'number' ||
      typeof parsed.goalieFreq !== 'number' ||
      typeof parsed.shooterFreq !== 'number' ||
      typeof parsed.puckSpeed !== 'number'
    ) {
      return null;
    }
    return {
      goalFreq: clampFrequency(parsed.goalFreq),
      goalieFreq: clampFrequency(parsed.goalieFreq),
      shooterFreq: clampFrequency(parsed.shooterFreq),
      puckSpeed: clampPuckSpeed(parsed.puckSpeed),
    };
  } catch {
    return null;
  }
}

const AMATEUR_DAILY_COURT_BACKGROUND = '/sprites/amateur-daily-court.webp';
const ARENA_ICE_COURT_BACKGROUND = '/sprites/app-arena-ice.webp';
const ARENA_CUBE_IMAGE = '/sprites/app-arena-cube.webp';

function saveTrainingHitboxesVisible(value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TRAINING_HITBOX_TOGGLE_STORAGE_KEY, String(value));
  } catch {
    // The toggle is a local admin aid; storage failure should not block gameplay.
  }
}

function saveTrainingSpeedOverrides(value: SpeedOverrides | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) {
      window.localStorage.removeItem(TRAINING_SPEED_OVERRIDES_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(TRAINING_SPEED_OVERRIDES_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Speed controls are a local training aid; storage failure should not block gameplay.
  }
}

function isDevTrainingDebugHost(hostname: string): boolean {
  const normalizedHostname = hostname.trim().toLowerCase();
  return (
    normalizedHostname === 'dev.hockey.inbotwetrust.ru' ||
    normalizedHostname === 'localhost' ||
    normalizedHostname === '127.0.0.1' ||
    normalizedHostname === '::1'
  );
}

function movementDistancePxForElapsed(elapsedMs: number, shooterFrequency: number): number {
  const safeElapsed = Math.max(0, elapsedMs);
  const safeFrequency = Math.max(0, shooterFrequency);
  return (safeElapsed * SHOOTER_AMPLITUDE * 4 * safeFrequency) / 1000;
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

export function initialGameRouteState(search: string): {
  selectedLevel: GameLevel;
  activeAmateurMatchId: string | null;
  amateurView: AmateurView;
  beginnerMode: BeginnerMode;
  dailyView: DailyView;
} {
  const params = new URLSearchParams(search);
  const view = params.get('view');
  const amateurSection = params.get('section');
  const activeAmateurMatchId = view === 'amateur' ? params.get('match') : null;
  return {
    selectedLevel: view === 'amateur' ? 'amateur' : view === 'pro' ? 'pro' : 'beginner',
    activeAmateurMatchId,
    amateurView:
      amateurSection === 'tournaments'
        ? 'tournaments'
        : amateurSection === 'duels'
          ? 'duels'
          : 'hub',
    beginnerMode: view === 'training' ? 'training' : 'daily',
    dailyView: view === 'daily' ? 'play' : 'arena',
  };
}

export function duelBackLabel(
  source: 'challenge' | 'matchmaking' | 'tournament',
  directPlayOnly: boolean,
): string {
  if (source === 'tournament') return 'К турниру';
  return directPlayOnly ? 'К арене' : 'К дуэлям';
}

export function tournamentDuelBackPath(
  fromSections: boolean,
  tournamentId: string | null = null,
): string {
  const params = new URLSearchParams({ view: 'amateur', section: 'tournaments' });
  if (tournamentId) {
    params.set('tournament', tournamentId);
    params.set('tab', 'schedule');
  }
  if (fromSections) params.set('from', 'sections');
  return `/?${params.toString()}`;
}

export function DailyScreen(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const data = useDailyStore((s) => s.data);
  const error = useDailyStore((s) => s.error);
  const loading = useDailyStore((s) => s.loading);
  const refresh = useDailyStore((s) => s.refresh);
  const routeParams = new URLSearchParams(location.search);
  const fromSections = routeParams.get('from') === 'sections';
  const tournamentOrigin = routeParams.get('section') === 'tournaments';
  const tournamentId = routeParams.get('tournament');
  const initialRouteState = initialGameRouteState(location.search);
  const [selectedLevel, setSelectedLevel] = useState<GameLevel>(initialRouteState.selectedLevel);
  const [activeAmateurMatchId, setActiveAmateurMatchId] = useState<string | null>(
    initialRouteState.activeAmateurMatchId,
  );
  const [amateurView, setAmateurView] = useState<AmateurView>(initialRouteState.amateurView);
  const [beginnerMode, setBeginnerMode] = useState<BeginnerMode>(initialRouteState.beginnerMode);
  const [dailyView, setDailyView] = useState<DailyView>(initialRouteState.dailyView);
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
        setAmateurView(
          section === 'tournaments' ? 'tournaments' : section === 'duels' ? 'duels' : 'hub',
        );
      }
    }
    if (view === 'pro') {
      setDailyView('arena');
      setSelectedLevel('pro');
      setBeginnerMode('daily');
      setActiveAmateurMatchId(null);
    }
  }, [location.search]);

  if (routeParams.get('view') === 'classic' && tournamentId !== null) {
    return (
      <ClassicTournamentPlayView
        tournamentId={tournamentId}
        onBack={() =>
          navigate(tournamentDuelBackPath(fromSections, tournamentId), { replace: true })
        }
      />
    );
  }

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
          <div className="arena-error-state" role="alert">
            <div className="arena-error-state__title">Не удалось загрузить</div>
            <div className="arena-error-state__copy">{error}</div>
            <button
              type="button"
              className="btn btn--cta"
              onClick={() => void refresh()}
              disabled={loading}
            >
              Повторить
            </button>
            <div className="arena-error-state__hint">
              Если ошибка повторяется — выйди и зайди заново через /login.
            </div>
          </div>
        ) : (
          <div className="route-loading" role="status">
            Загрузка…
          </div>
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
    setAmateurView('duels');
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

  const openAmateurHub = (): void => {
    setPendingPlayEntrance(null);
    setPendingPlayRouteTransition(null);
    setActiveAmateurMatchId(null);
    setAmateurView('hub');
    navigate(`/?view=amateur${fromSections ? '&from=sections' : ''}`, { replace: true });
  };

  if (selectedLevel === 'beginner' && beginnerMode === 'daily' && dailyView === 'play') {
    return (
      <DailyPlayView
        backLabel={tournamentOrigin ? 'К турниру' : 'К режимам'}
        onBack={() => {
          if (tournamentOrigin) {
            navigate(tournamentDuelBackPath(fromSections, tournamentId), { replace: true });
            return;
          }
          openHub();
        }}
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
                if (tournamentOrigin) {
                  setAmateurView('tournaments');
                  navigate(tournamentDuelBackPath(fromSections, tournamentId), { replace: true });
                  return;
                }
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
      if (amateurView === 'hub') {
        return (
          <AmateurHubPage
            onBack={fromSections ? openSections : openHub}
            onOpenSection={(section) => {
              if (section === 'bonus-games') {
                navigate(fromSections ? '/bonus-games?from=sections' : '/bonus-games');
                return;
              }
              setAmateurView(section);
              navigate(`/?view=amateur&section=${section}${fromSections ? '&from=sections' : ''}`, {
                replace: true,
              });
            }}
          />
        );
      }
      if (amateurView === 'duels') {
        return (
          <AmateurDuelsPage
            onBack={openAmateurHub}
            onOpenMatch={(matchId) => {
              setActiveAmateurMatchId(matchId);
              navigate(
                `/?view=amateur&match=${encodeURIComponent(matchId)}&play=1${fromSections ? '&from=sections' : ''}`,
                { replace: true },
              );
            }}
          />
        );
      }
      if (amateurView === 'tournaments') {
        return <AmateurTournamentsPage onBack={openAmateurHub} />;
      }
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const data = useDailyStore((s) => s.data)!;
  const refresh = useDailyStore((s) => s.refresh);
  const trainingData = useTrainingSessionStore((s) => s.data);
  const trainingInFlight = useTrainingSessionStore((s) => s.inFlight);
  const [modeInfoModal, setModeInfoModal] = useState<ModeInfoModalContent | null>(null);
  const [duelStatsMatch, setDuelStatsMatch] = useState<AmateurDuelMatch | null>(null);
  const [arenaActionId, setArenaActionId] = useState<string | null>(null);
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
  const classicTournamentGames = useQuery({
    queryKey: ['tournaments', 'classic', 'active'],
    queryFn: fetchActiveClassicTournamentGames,
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
  const prioritizedDuelEntryIdsRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      data.state !== 'period_active' &&
      data.state !== 'break_active' &&
      data.state !== 'closed' &&
      !isDailyLockedByTraining &&
      activeDuelEvents.length === 0 &&
      (classicTournamentGames.data?.games?.length ?? 0) === 0
    ) {
      return undefined;
    }
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [
    activeDuelEvents.length,
    classicTournamentGames.data?.games?.length,
    data.state,
    isDailyLockedByTraining,
  ]);

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
  const isArenaLaunching = false;
  const dailyActionDisabled = pending || arenaActionId === 'daily' || isArenaLaunching;
  const dailyActionLabel = 'На лёд';
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
              ariaLabel: `Завершена. До обновления ${formatHms(nextDayRemaining)}`,
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
      const value = await prepare();
      await enter(value);
    },
    [],
  );

  const handleDailyAction = async (): Promise<void> => {
    if (pending || arenaActionId === 'daily' || isArenaLaunching) return;
    await runArenaLaunch(
      'daily',
      async () => null,
      () => onOpenDailyPlay(),
    );
  };

  const handleOpenTraining = async (): Promise<void> => {
    if (trainingInFlight || arenaActionId === 'training' || isArenaLaunching) return;
    if (
      isTrainingLockedByDaily ||
      trainingData?.state === 'active' ||
      trainingData?.state === 'closed' ||
      trainingData?.state === 'idle' ||
      !trainingData
    ) {
      await runArenaLaunch(
        'training',
        async () => null,
        () => onOpenTrainingPlay(),
      );
      return;
    }
    await runArenaLaunch(
      'training',
      async () => null,
      () => onOpenTraining(),
    );
  };

  const handleOpenDuel = async (event: AmateurDuelMatch): Promise<void> => {
    if (arenaActionId !== null || isArenaLaunching) return;
    setArenaActionId(`duel-${event.id}`);
    try {
      await runArenaLaunch(
        `duel-${event.id}`,
        async () => event.id,
        (matchId) => {
          onOpenAmateurMatch(matchId, {
            entrance: false,
            directPlay: true,
          });
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

  const acceptArenaDuelMut = useMutation({
    mutationFn: (matchId: string) => acceptAmateurDuel(matchId),
    onSuccess: (_res, matchId) => {
      void queryClient.invalidateQueries({ queryKey: ['amateur-duel'] });
      onOpenAmateurMatch(matchId, { entrance: false, directPlay: true });
    },
    onError: (err) => {
      setModeInfoModal({
        title: 'Не удалось принять дуэль',
        text: err instanceof Error ? err.message : 'Попробуйте ещё раз.',
      });
      void queryClient.invalidateQueries({ queryKey: ['amateur-duel'] });
    },
  });

  const declineArenaDuelMut = useMutation({
    mutationFn: (matchId: string) => declineAmateurDuel(matchId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['amateur-duel'] });
    },
    onError: (err) => {
      setModeInfoModal({
        title: 'Не удалось отклонить дуэль',
        text: err instanceof Error ? err.message : 'Попробуйте ещё раз.',
      });
      void queryClient.invalidateQueries({ queryKey: ['amateur-duel'] });
    },
  });

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
    disabled: dailyActionDisabled,
    onEnter: () => void handleDailyAction(),
    scoreboard: (
      <DailyHubScoreboard
        activePeriod={dailyHubScoreboard.activePeriod}
        ariaLabel={dailyHubScoreboard.ariaLabel}
        periodsTotal={data.total_periods}
        timer={dailyHubScoreboard.timer}
        timerLabel={dailyHubScoreboard.timerLabel}
        timerOnly={data.state === 'closed'}
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
    ctaLabel: 'На лёд',
    disabled: trainingInFlight || arenaActionId === 'training' || isArenaLaunching,
    onEnter: handleOpenTraining,
  };
  const duelArenaEntries = activeDuelEvents.map<ArenaEntry>((event) => {
    const timing = duelEventTiming(event, now);
    const isIncomingInvite = isDuelInviteForMe(event);
    const invitePending =
      (acceptArenaDuelMut.isPending && acceptArenaDuelMut.variables === event.id) ||
      (declineArenaDuelMut.isPending && declineArenaDuelMut.variables === event.id);
    return {
      id: `duel-${event.id}`,
      kind: 'duel',
      eyebrow: 'Активная дуэль',
      title: event.opponent.display_name,
      subtitle: duelOutcomeText(event),
      meta: `${timing.label}: ${timing.value}`,
      ctaLabel: arenaDuelCtaLabel(event, now),
      disabled:
        isIncomingInvite ||
        arenaActionId === `duel-${event.id}` ||
        isArenaLaunching ||
        invitePending,
      opponentName: event.opponent.display_name,
      opponentAvatarUrl: event.opponent.avatar_url,
      typeLabel: duelKindText(event.rules.duelKind),
      venueRole: event.venue_role,
      secondaryActions: isIncomingInvite ? (
        <div
          style={{
            width: '78%',
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
          }}
        >
          <button
            type="button"
            className="btn btn--ghost"
            disabled={invitePending}
            onClick={() => declineArenaDuelMut.mutate(event.id)}
            style={{ minHeight: 34, fontSize: 'clamp(10px, 1.45vh, 12px)', padding: '0 10px' }}
          >
            Отклонить
          </button>
          <button
            type="button"
            className="btn btn--cta"
            disabled={invitePending}
            onClick={() => acceptArenaDuelMut.mutate(event.id)}
            style={{ minHeight: 34, fontSize: 'clamp(10px, 1.45vh, 12px)', padding: '0 10px' }}
          >
            Принять
          </button>
        </div>
      ) : undefined,
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
  const classicArenaEntries = [...(classicTournamentGames.data?.games ?? [])]
    .sort((left, right) => {
      const priority = (game: ActiveClassicTournamentGame): number => {
        if (
          game.state === 'period_active' ||
          game.state === 'break_active' ||
          (game.state === 'idle' && game.current_period > 0)
        ) {
          return 0;
        }
        return game.state === 'closed' ? 2 : 1;
      };
      return priority(left) - priority(right);
    })
    .map<ArenaEntry>((game) => {
      const deadlineRemaining = Math.max(0, timestampMs(game.closes_at) - now);
      const started =
        game.state === 'period_active' ||
        game.state === 'break_active' ||
        (game.state === 'idle' && game.current_period > 0);
      const completed = game.state === 'closed';
      const accuracy = formatGoalRate(game.total_goals, game.total_shots);
      return {
        id: `classic-${game.tournament_id}`,
        kind: 'classic',
        eyebrow: `Турнир · ${game.tournament_day}-й тур`,
        title: game.tournament_title,
        subtitle: completed
          ? 'Игра завершена, результат сохранён.'
          : started
            ? 'Турнирная игра уже начата.'
            : 'Отдельная игра по правилам этого турнира.',
        meta: completed
          ? `${game.total_goals} шайб · точность ${accuracy}`
          : `${game.current_period > 0 ? `${game.current_period}-й период` : 'Три периода'} · до ${formatEventRemaining(deadlineRemaining)}`,
        ctaLabel: started ? 'Продолжить' : 'Начать',
        disabled: completed,
        secondaryActions: completed ? (
          <div
            aria-label={`Результат: ${game.total_goals} шайб, точность ${accuracy}`}
            style={{
              color: '#e9fbff',
              fontSize: 'clamp(12px, 1.7vh, 15px)',
              fontWeight: 900,
              textAlign: 'center',
            }}
          >
            {game.total_goals} шайб · точность {accuracy}
          </div>
        ) : undefined,
        onEnter: () =>
          navigate(`/?view=classic&tournament=${encodeURIComponent(game.tournament_id)}`, {
            replace: true,
          }),
        ...(completed
          ? {}
          : {
              scoreboard: (
                <DailyHubScoreboard
                  activePeriod={
                    game.state === 'period_active'
                      ? game.current_period
                      : Math.min(3, game.current_period + 1)
                  }
                  ariaLabel={`${game.tournament_title}. ${game.tournament_day}-й тур. До закрытия ${formatEventRemaining(deadlineRemaining)}`}
                  periodsTotal={3}
                  timer={formatEventRemaining(deadlineRemaining)}
                  timerLabel="До закрытия"
                />
              ),
            }),
      };
    });
  const arenaEntries: ArenaEntry[] = [
    ...duelArenaEntries,
    ...classicArenaEntries,
    dailyArenaEntry,
    trainingArenaEntry,
  ];
  const duelArenaEntryIds = duelArenaEntries.map((entry) => entry.id).join('|');
  const firstDuelArenaEntryId = duelArenaEntries[0]?.id ?? null;

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

  useEffect(() => {
    if (firstDuelArenaEntryId === null) {
      prioritizedDuelEntryIdsRef.current = null;
      return;
    }
    if (prioritizedDuelEntryIdsRef.current === duelArenaEntryIds) return;
    prioritizedDuelEntryIdsRef.current = duelArenaEntryIds;
    if (activeCubeEntryId === firstDuelArenaEntryId) return;
    setActiveCubeEntryId(firstDuelArenaEntryId);
    saveArenaSelectedEntryId(firstDuelArenaEntryId);
  }, [activeCubeEntryId, duelArenaEntryIds, firstDuelArenaEntryId]);

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
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100dvh',
        padding: 0,
        overflow: 'hidden',
        background: '#06111d',
      }}
    >
      <section
        aria-label="Игровая арена"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          width: '100%',
          height: '100%',
          display: 'block',
          padding: 0,
        }}
      >
        <ArenaVideoCube
          entries={arenaEntries}
          activeIndex={activeCubeIndex}
          onActiveIndexChange={handleArenaActiveIndexChange}
        />
      </section>

      {modeInfoModal && (
        <ModeInfoModal
          title={modeInfoModal.title}
          text={modeInfoModal.text}
          onClose={() => setModeInfoModal(null)}
        />
      )}

      {duelStatsCurrentMatch && (
        <DuelStatsModal match={duelStatsCurrentMatch} onClose={() => setDuelStatsMatch(null)} />
      )}
    </main>
  );
}

function ArenaVideoCube({
  entries,
  activeIndex,
  onActiveIndexChange,
}: {
  entries: ArenaEntry[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
}): JSX.Element {
  const activeEntry = entries[Math.min(entries.length - 1, Math.max(0, activeIndex))] ?? entries[0];
  const hasManyEntries = entries.length > 1;
  const swipeStartRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const goTo = useCallback(
    (nextIndex: number): void => {
      if (entries.length === 0) return;
      const normalized = (nextIndex + entries.length) % entries.length;
      onActiveIndexChange(normalized);
    },
    [entries.length, onActiveIndexChange],
  );
  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      if (!hasManyEntries) {
        swipeStartRef.current = null;
        return;
      }
      swipeStartRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
    },
    [hasManyEntries],
  );
  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      const start = swipeStartRef.current;
      swipeStartRef.current = null;
      if (!start || start.pointerId !== event.pointerId) return;

      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      if (absX < 44 || absX < absY * 1.2) return;

      event.preventDefault();
      goTo(activeIndex + (deltaX < 0 ? 1 : -1));
    },
    [activeIndex, goTo],
  );
  const handlePointerCancel = useCallback((): void => {
    swipeStartRef.current = null;
  }, []);

  if (!activeEntry) {
    return <div style={{ minHeight: 320 }} />;
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#06111d',
      }}
    >
      <img
        className="arena-video-cube__background"
        src={ARENA_ICE_COURT_BACKGROUND}
        alt=""
        aria-hidden="true"
      />
      <div className="arena-video-cube__plate">
        <img className="arena-video-cube__cube" src={ARENA_CUBE_IMAGE} alt="" aria-hidden="true" />
        <div
          className="arena-video-cube__screen"
          aria-label="Разделы на табло"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerCancel}
          style={{
            display: 'grid',
            gridTemplateRows: 'auto minmax(0, 1fr) auto',
            rowGap: 'clamp(5px, 0.8vh, 8px)',
            padding: 'clamp(10px, 1.6vh, 14px) 0 clamp(9px, 1.4vh, 13px)',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: '4%',
              right: '4%',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              pointerEvents: 'none',
            }}
          >
            <ArenaTableauNavButton
              disabled={!hasManyEntries}
              label="Предыдущий экран табло"
              onClick={() => goTo(activeIndex - 1)}
            >
              ‹
            </ArenaTableauNavButton>
            <ArenaTableauNavButton
              disabled={!hasManyEntries}
              label="Следующий экран табло"
              onClick={() => goTo(activeIndex + 1)}
            >
              ›
            </ArenaTableauNavButton>
          </div>
          <div
            style={{
              position: 'relative',
              zIndex: 4,
              minWidth: 0,
              display: 'flex',
              justifyContent: 'center',
              gap: 6,
              overflow: 'hidden',
            }}
          >
            {entries.map((entry, index) => {
              const active = index === activeIndex;
              return (
                <button
                  key={entry.id}
                  type="button"
                  aria-label={`Выбрать ${entry.eyebrow}`}
                  aria-pressed={active}
                  onClick={() => goTo(index)}
                  style={{
                    width: 7,
                    height: 7,
                    flex: '0 0 7px',
                    padding: 0,
                    border: 0,
                    borderRadius: 999,
                    background: active ? 'rgba(244, 253, 255, 0.96)' : 'rgba(178, 232, 255, 0.42)',
                    boxShadow: active
                      ? '0 0 7px rgba(212, 249, 255, 0.74)'
                      : '0 0 5px rgba(86, 205, 255, 0.24)',
                    color: 'transparent',
                    cursor: 'pointer',
                  }}
                />
              );
            })}
          </div>
          <ArenaCubeFace entry={activeEntry} />
          {activeEntry.secondaryActions ?? (
            <button
              type="button"
              className="btn btn--cta"
              disabled={activeEntry.disabled}
              onClick={activeEntry.onEnter}
              style={{
                position: 'relative',
                zIndex: 3,
                width: '70%',
                minWidth: 0,
                minHeight: 'clamp(36px, 4.8vh, 44px)',
                margin: '0 auto',
                padding: '0 16px',
                boxSizing: 'border-box',
                justifyContent: 'center',
                fontSize: 'clamp(12px, 1.65vh, 14px)',
                fontWeight: 900,
                letterSpacing: '0.06em',
                lineHeight: 1,
                background:
                  'linear-gradient(180deg, rgba(246, 252, 255, 0.98), rgba(214, 234, 247, 0.96))',
                color: '#132033',
                border: '1px solid rgba(255, 255, 255, 0.78)',
                boxShadow:
                  '0 0 14px rgba(138, 221, 255, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.86)',
              }}
            >
              {activeEntry.ctaLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ArenaTableauNavButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 28,
        height: 44,
        border: 0,
        borderRadius: 0,
        background: 'transparent',
        color: disabled ? 'rgba(202, 242, 255, 0.22)' : 'rgba(232, 251, 255, 0.92)',
        textShadow: disabled ? 'none' : '0 0 8px rgba(96, 220, 255, 0.58)',
        boxShadow: 'none',
        fontSize: 30,
        fontWeight: 950,
        lineHeight: 1,
        padding: 0,
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
        cursor: disabled ? 'default' : 'pointer',
        pointerEvents: 'auto',
      }}
    >
      {children}
    </button>
  );
}

function ArenaCubeFace({ entry }: { entry: ArenaEntry }): JSX.Element {
  const showDuelIdentity = entry.kind === 'duel' && Boolean(entry.opponentName);

  return (
    <div
      role="article"
      aria-label={`${entry.eyebrow}: ${entry.title}`}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 0,
        display: 'grid',
        alignItems: 'stretch',
        padding: '0 clamp(38px, 11vw, 46px)',
        boxSizing: 'border-box',
        color: '#e9fbff',
        fontFamily: 'var(--font-mono)',
        textShadow: '0 0 8px rgba(122, 229, 255, 0.36)',
      }}
    >
      <div
        style={{
          minHeight: 0,
          height: '100%',
          display: 'grid',
          gridTemplateRows: 'auto auto auto auto',
          alignContent: 'space-evenly',
          justifyItems: 'center',
          gap: 'clamp(4px, 0.7vh, 6px)',
          textAlign: 'center',
          padding: 0,
        }}
      >
        <div
          style={{
            color: 'rgba(205, 246, 255, 0.88)',
            fontSize: 'clamp(7px, 1.08vh, 9px)',
            fontWeight: 950,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            lineHeight: 1.05,
            textShadow: '0 0 8px rgba(99, 218, 255, 0.44)',
          }}
        >
          {entry.eyebrow}
        </div>
        {showDuelIdentity ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'clamp(38px, 6vh, 54px) minmax(0, 1fr)',
              alignItems: 'center',
              gap: 'clamp(8px, 1.8vh, 14px)',
              textAlign: 'left',
              minWidth: 0,
              maxWidth: 'min(100%, 340px)',
              margin: '0 auto',
            }}
          >
            <UserAvatar
              avatarUrl={entry.opponentAvatarUrl}
              name={entry.opponentName}
              size={46}
              fontSize={19}
              style={{
                border: '1px solid rgba(122, 228, 255, 0.76)',
                boxShadow: '0 0 12px rgba(72, 204, 255, 0.46)',
              }}
            />
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div
                style={{
                  color: '#f7feff',
                  fontSize: 'clamp(14px, 2.46vh, 21px)',
                  lineHeight: 0.95,
                  fontWeight: 950,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {entry.title}
              </div>
              {entry.typeLabel && (
                <div
                  style={{
                    color: 'rgba(196, 242, 255, 0.82)',
                    fontSize: 'clamp(8px, 1.16vh, 10px)',
                    fontWeight: 900,
                    lineHeight: 1,
                  }}
                >
                  {entry.typeLabel}
                </div>
              )}
              {entry.venueRole && <VenueBadge role={entry.venueRole} tone="dark" />}
            </div>
          </div>
        ) : (
          <div
            style={{
              color: '#f7feff',
              fontSize: 'clamp(16px, 2.65vh, 22px)',
              lineHeight: 0.95,
              fontWeight: 950,
              overflowWrap: 'break-word',
              textTransform: 'uppercase',
            }}
          >
            {entry.title}
          </div>
        )}
        <div
          style={{
            maxWidth: 'min(72%, 280px)',
            margin: '0 auto',
            color: 'rgba(234, 246, 255, 0.9)',
            fontSize: 'clamp(9px, 1.24vh, 10px)',
            fontWeight: 850,
            lineHeight: 1.12,
            textShadow: '0 0 7px rgba(0, 12, 24, 0.88)',
          }}
        >
          {entry.subtitle}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
          }}
        >
          {entry.scoreboard ? (
            <div
              style={{
                width: '100%',
                maxWidth: 'min(300px, 92%)',
              }}
            >
              {entry.scoreboard}
            </div>
          ) : (
            <div
              style={{
                width: '100%',
                color: '#e9fbff',
                fontSize: 'clamp(12px, 1.85vh, 16px)',
                fontWeight: 950,
                lineHeight: 1.05,
                textAlign: 'center',
                textShadow: '0 0 8px rgba(100, 218, 255, 0.38)',
              }}
            >
              {entry.meta}
            </div>
          )}
        </div>
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
  timerOnly = false,
}: {
  activePeriod: number | null;
  align?: 'center' | 'left';
  ariaLabel: string;
  periodsTotal: number;
  timer: string;
  timerLabel: string;
  timerOnly?: boolean;
}): JSX.Element {
  return (
    <div
      aria-label={ariaLabel}
      className={timerOnly ? 'daily-hub-scoreboard--timer-only' : undefined}
      style={{
        width: align === 'left' ? 'auto' : '100%',
        maxWidth: align === 'left' ? 'none' : 306,
        padding: 0,
        display: 'grid',
        gridTemplateColumns: timerOnly
          ? 'minmax(0, 1fr)'
          : align === 'left'
            ? 'max-content max-content'
            : 'minmax(0, 1fr) minmax(0, 1fr)',
        alignItems: 'center',
        justifyItems: timerOnly ? 'center' : align === 'left' ? 'start' : 'center',
        gap: align === 'left' ? 36 : 'clamp(6px, 1.1vh, 10px)',
        margin: '0 auto',
      }}
    >
      <DailyEventScoreboardColumn align={align} label={timerLabel} value={timer} />
      {!timerOnly && (
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
      )}
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

export function isDuelReadyPresenceState(state: AmateurDuelParticipantState): boolean {
  return (
    state === 'ready' ||
    state === 'accepted' ||
    state === 'period_active' ||
    state === 'break_active' ||
    state === 'completed'
  );
}

function isActiveDuelPlayerPresenceState(state: AmateurDuelParticipantState): boolean {
  return state !== 'invited' && state !== 'loadout_pending' && state !== 'forfeit';
}

export function duelRinkReadyPresenceForMatch(
  match: AmateurDuelMatch | AmateurDuelMatchState,
): Pick<ReadyPresence, 'playerReady' | 'goalieReady'> {
  if (match.status === 'ready_check') {
    return {
      playerReady: match.me.state === 'ready',
      goalieReady: match.opponent.state === 'ready',
    };
  }

  if (match.status === 'active') {
    return {
      playerReady: isActiveDuelPlayerPresenceState(match.me.state),
      goalieReady: true,
    };
  }

  return {
    playerReady: isDuelReadyPresenceState(match.me.state),
    goalieReady: isDuelReadyPresenceState(match.opponent.state),
  };
}

function isDuelInviteForMe(match: AmateurDuelMatch): boolean {
  return match.status === 'invited' && match.me.side === 'opponent' && match.me.state === 'invited';
}

function isDuelInviteFromMe(match: AmateurDuelMatch): boolean {
  return match.status === 'invited' && match.me.side === 'challenger';
}

function arenaDuelCtaLabel(match: AmateurDuelMatch, fallbackNow: number): string {
  const nowMs = duelMatchNowMs(match, fallbackNow);
  if (match.me.state === 'period_active') return 'Продолжить дуэль';
  if (match.status === 'settled') return 'Показать результат';
  if (match.status === 'cancelled' || match.status === 'expired') return 'Дуэль завершена';
  if (isDuelInviteFromMe(match)) return 'Ждём ответ';
  if (canStartArenaDuelPeriod(match, nowMs)) return 'Начать дуэль';
  if (isDuelInviteForMe(match)) return 'Принять вызов';
  if (match.status === 'ready_check' && match.me.state !== 'ready') return 'К дуэли';
  if (match.status === 'ready_check' && match.me.state === 'ready') return 'Ждём готовность';
  if (match.status === 'active' && match.opponent.state === 'period_active')
    return 'Соперник играет';
  if (match.me.state === 'break_active') return 'Перерыв';
  if (match.me.state === 'completed' || match.me.state === 'forfeit') return 'Вы сыграли';
  return 'К дуэли';
}

function duelRinkPrimaryLabel(match: AmateurDuelMatch, fallbackNow: number): string {
  const nowMs = duelMatchNowMs(match, fallbackNow);
  if (match.me.state === 'period_active') return 'Бросок';
  if (canStartArenaDuelPeriod(match, nowMs)) return 'Начать';
  if (match.status === 'ready_check' && match.me.state !== 'ready') return 'Готов';
  if (match.status === 'ready_check' && match.me.state === 'ready') return 'Ждём соперника';
  if (match.status === 'invited' && isDuelInviteForMe(match)) return 'Примите вызов';
  if (match.status === 'invited') return 'Ждём ответ';
  if (match.status === 'active' && match.me.state === 'accepted') return 'Начать';
  if (match.status === 'active' && match.opponent.state === 'period_active')
    return 'Ждём соперника';
  return arenaDuelCtaLabel(match, fallbackNow);
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

function intermissionContinueDeadlineMs(participant: AmateurDuelMatch['me']): number {
  if (participant.state !== 'accepted' || participant.current_period <= 0) return 0;
  const readyAt = timestampMs(participant.ready_at);
  return readyAt > 0 ? readyAt + DUEL_INTERMISSION_CONTINUE_GRACE_MS : 0;
}

export function duelEventTiming(match: AmateurDuelMatch, fallbackNow: number): DuelEventTiming {
  const now = duelMatchNowMs(match, fallbackNow);
  const startsAt = timestampMs(match.starts_at);
  const endsAt = timestampMs(match.ends_at);
  const inviteEndsAt = timestampMs(match.ready_expires_at);
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

  if (match.status === 'invited') {
    const value = inviteEndsAt > now ? formatMs(inviteEndsAt - now) : '00:00';
    const isInvitee = isDuelInviteForMe(match);
    const label = isInvitee ? 'До ответа' : 'До автоотмены';
    const stateText = isInvitee ? 'Вас вызвали на дуэль' : 'Ждём ответ соперника';
    return {
      activePeriod: 1,
      ariaLabel: `${stateText}. ${label} ${value}. Счёт ${score}`,
      label,
      value,
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

  if (match.status === 'active') {
    const myContinueDeadline = intermissionContinueDeadlineMs(match.me);
    if (myContinueDeadline > now) {
      const value = formatMs(myContinueDeadline - now);
      return {
        activePeriod: duelNextPeriod(match),
        ariaLabel: `До поражения ${value}. Счёт ${score}`,
        label: 'До поражения',
        value,
      };
    }
    const opponentContinueDeadline = intermissionContinueDeadlineMs(match.opponent);
    if (
      opponentContinueDeadline > now &&
      (match.me.state === 'completed' || match.me.state === 'forfeit')
    ) {
      const value = formatMs(opponentContinueDeadline - now);
      return {
        activePeriod: duelNextPeriod(match),
        ariaLabel: `До поражения соперника ${value}. Счёт ${score}`,
        label: 'До поражения соперника',
        value,
      };
    }
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
        fontWeight: 900,
        background: active ? 'rgba(107, 224, 255, 0.24)' : 'rgba(7, 32, 52, 0.28)',
        border: active
          ? '1px solid rgba(182, 238, 255, 0.72)'
          : '1px solid rgba(118, 215, 255, 0.24)',
        color: active ? '#e9fbff' : 'rgba(174, 233, 255, 0.46)',
        boxShadow: active
          ? '0 0 9px rgba(122, 229, 255, 0.54), inset 0 0 8px rgba(82, 205, 255, 0.24)'
          : 'none',
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
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'left' ? 'flex-start' : 'center',
        gap: 5,
        minWidth: 0,
        lineHeight: 1,
        width: '100%',
      }}
    >
      <DailyEventScoreboardLabel>{label}</DailyEventScoreboardLabel>
      <span
        style={{
          color: '#e9fbff',
          fontFamily: 'var(--font-mono)',
          fontSize: 'clamp(13px, 2.05vh, 18px)',
          fontWeight: 950,
          lineHeight: 1,
          letterSpacing: '0.06em',
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          textShadow: '0 0 7px rgba(143, 232, 255, 0.72), 0 0 14px rgba(44, 177, 255, 0.38)',
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
        color: 'rgba(187, 238, 255, 0.72)',
        fontSize: 'clamp(6px, 0.95vh, 8px)',
        fontWeight: 900,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        textShadow: '0 0 7px rgba(88, 207, 255, 0.36)',
      }}
    >
      {children}
    </span>
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
  if (state === 'invited') return 'ждёт ответ';
  if (state === 'loadout_pending') return 'выбор';
  if (state === 'ready') return 'готов';
  if (state === 'accepted') return 'можно играть';
  if (state === 'period_active') return 'играет';
  if (state === 'break_active') return 'перерыв';
  if (state === 'completed') return 'завершил';
  return 'не сыграл';
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

function ModeShell({
  title,
  onBack,
  children,
  variant = 'default',
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
  variant?: 'default' | 'section-hub';
}): JSX.Element {
  const isSectionHub = variant === 'section-hub';
  return (
    <main
      className={`screen mode-shell${isSectionHub ? ' mode-shell--section-hub' : ''}`}
      style={{
        padding: isSectionHub
          ? 'calc(18px + var(--app-safe-top)) 14px 24px'
          : 'calc(22px + var(--app-safe-top)) 24px 24px',
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
        <div
          className={isSectionHub ? 'bonus-games-catalog__header' : 'mode-shell__header'}
          style={isSectionHub ? undefined : { display: 'flex', alignItems: 'center', gap: 10 }}
        >
          <button
            type="button"
            className={isSectionHub ? 'icon-btn catalog-header-back' : 'icon-btn'}
            onClick={onBack}
            aria-label="Назад"
            title="Назад"
            style={
              isSectionHub
                ? undefined
                : {
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
                  }
            }
          >
            <ArrowLeft size={16} />
          </button>
          <h1
            className={
              isSectionHub
                ? 'bonus-games-catalog__title screen-title-on-arena'
                : 'mode-shell__title'
            }
            style={
              isSectionHub ? undefined : { margin: 0, minWidth: 0, fontSize: 24, fontWeight: 800 }
            }
          >
            {title}
          </h1>
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
  const [playTraining, setPlayTraining] = useState(() => autoPlay);
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

  useLayoutEffect(() => {
    if (autoPlay && data) setPlayTraining(true);
  }, [autoPlay, data]);

  const shotsLimit = data?.shots_limit ?? 500;
  const shotsTaken = data?.shots_taken ?? 0;
  const goals = data?.goals ?? 0;
  const accuracy = shotsTaken > 0 ? Math.round((goals / shotsTaken) * 100) : 0;
  const nextDayAt = data ? new Date(data.next_day_starts_at).getTime() : 0;
  const nextDayRemaining = Math.max(0, nextDayAt - now);
  const canConfigureTraining = !data || data.state === 'idle' || data.state === 'active';
  const trainingActionLabel = data?.state === 'active' ? 'Продолжить тренировку' : 'На лёд';

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
    setLocalPlayEntrance(false);
    if (data?.state === 'active' && data.selected_period !== selectedPeriod) {
      const switched = await start(selectedPeriod);
      if (switched === null) return;
    }
    setPlayTraining(true);
    onPlayStart?.();
  };

  if (data && playTraining) {
    const shouldPlayEntrance = playEntranceOnStart || localPlayEntrance;
    return (
      <TrainingPlayView
        selectedPeriod={selectedPeriod}
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
    <ModeShell title="Тренировка" onBack={onBack} variant="section-hub">
      <section className="mode-info-card training-info-card" aria-label="Информация о тренировке">
        <div className="training-info-overview">
          <div className="training-info-artwork">
            <img src="/modes/beginner.webp" alt="Тренировка" draggable={false} />
          </div>
          <div className="training-info-overview__copy">
            {loading && !data ? (
              <div className="training-info-copy">Загрузка...</div>
            ) : (
              <>
                {error && <div className="training-info-error">{error}</div>}
                {canConfigureTraining && (
                  <div className="training-info-copy">
                    Выбери модель периода. Скорости игрока, ворот, шайбы и вратаря будут такими же,
                    как в дневной игре выбранного периода.
                  </div>
                )}
                {data?.state === 'closed' && (
                  <div className="training-info-copy">
                    Тренировка на сегодня завершена. Новая откроется завтра.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div className="training-summary-grid">
          <TotalCell label="ЛИМИТ" value={`${shotsTaken}/${shotsLimit}`} />
          <TotalCell label="ЧАСТОТА" value="24ч" />
          <TotalCell
            label="ДО ОБНОВЛЕНИЯ"
            value={data ? formatHms(nextDayRemaining) : '--:--:--'}
          />
        </div>
        {!loading && data?.state === 'closed' && (
          <div className="training-summary-grid">
            <TotalCell label="ГОЛЫ" value={String(goals)} />
            <TotalCell label="БРОСКИ" value={`${shotsTaken}/${shotsLimit}`} />
            <TotalCell label="ТОЧНОСТЬ" value={`${accuracy}%`} />
          </div>
        )}
      </section>
      {!loading && canConfigureTraining && (
        <section className="mode-setup-card training-config-card" aria-label="Настройка тренировки">
          <SegmentedTabs
            ariaLabel="Период тренировки"
            items={[
              { id: '1', label: '1 период' },
              { id: '2', label: '2 период' },
              { id: '3', label: '3 период' },
            ]}
            activeTab={String(selectedPeriod)}
            disabled={inFlight}
            onChange={(id) => setSelectedPeriod(Number(id) as 1 | 2 | 3)}
          />
          <PeriodSpeedSummary periodNumber={selectedPeriod} presets={data?.period_speed_presets} />
          <button
            type="button"
            className="btn btn--cta"
            disabled={inFlight}
            onClick={() => void handleTrainingAction()}
          >
            {trainingActionLabel}
          </button>
        </section>
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
  if (match.outcome === 'double_loss') return 'Дуэль не сыграна';
  if (match.winner_user_id === match.me.user_id) return 'Победа';
  if (match.winner_user_id === match.opponent.user_id) return 'Поражение';
  if (match.status === 'invited') {
    if (isDuelInviteForMe(match)) return 'Вас вызвали';
    if (isDuelInviteFromMe(match)) return 'Ждём ответ соперника';
    return 'Ждём подтверждение';
  }
  if (match.status === 'ready_check') {
    if (match.me.state === 'ready' && match.opponent.state === 'ready') return 'Оба готовы';
    if (match.me.state === 'ready') return 'Вы готовы';
    if (match.opponent.state === 'ready') return 'Соперник готов';
    return 'Выбор экипировки';
  }
  if (match.status === 'active') {
    if (match.me.state === 'period_active') return 'Вы играете';
    if (match.opponent.state === 'period_active') return 'Соперник играет';
    if (match.me.state === 'break_active') return 'Перерыв';
    if (
      (match.me.state === 'completed' || match.me.state === 'forfeit') &&
      (match.opponent.state === 'completed' || match.opponent.state === 'forfeit')
    )
      return 'Ждём расчёт';
    if (match.me.state === 'completed' || match.me.state === 'forfeit') return 'Вы сыграли';
    if (match.opponent.state === 'completed' || match.opponent.state === 'forfeit')
      return 'Ваш ход';
    if (match.me.state === 'accepted') return 'Ваш ход';
    if (match.opponent.state === 'accepted') return 'Ждём соперника';
    return 'Дуэль идёт';
  }
  if (match.status === 'cancelled' && match.settled_reason === 'declined') {
    return match.me.state === 'forfeit' ? 'Вы отказались' : 'Соперник отказался';
  }
  if (match.status === 'cancelled' && match.settled_reason === 'cancelled_by_challenger') {
    return match.me.side === 'challenger' ? 'Вы отменили вызов' : 'Вызов отменён';
  }
  if (match.status === 'cancelled') return 'Дуэль отменена';
  if (match.status === 'expired' && match.me.side === 'challenger') return 'Ответа не было';
  if (match.status === 'expired') return 'Вызов истёк';
  return 'Статус дуэли';
}

function duelCurrentTimerLabel(match: AmateurDuelMatch): string {
  if (match.status === 'invited') {
    return isDuelInviteForMe(match) ? 'до ответа на вызов' : 'до автоотмены вызова';
  }
  if (match.status === 'ready_check') return 'до отмены комнаты';
  if (match.status === 'active') {
    if (match.me.state === 'period_active') return 'ваш период идёт';
    if (match.opponent.state === 'period_active') return 'период соперника идёт';
    if (match.opponent.state === 'completed' || match.opponent.state === 'forfeit')
      return 'соперник завершил';
    if (match.me.state === 'completed' || match.me.state === 'forfeit') return 'вы завершили';
    if (match.me.state === 'accepted') return 'можно начинать период';
    return 'активная дуэль';
  }
  if (match.status === 'settled') return 'результат готов';
  if (match.status === 'cancelled') return 'дуэль отменена';
  return 'вызов истёк';
}

function duelDevHint(match: AmateurDuelMatch, nowMs: number): string {
  if (match.status === 'invited') {
    return isDuelInviteForMe(match)
      ? 'Нажми кнопку, чтобы принять вызов. Потом нужно нажать «Готов».'
      : 'Ждём, пока соперник примет вызов. В разделе дуэлей вызов можно отменить вручную.';
  }
  if (match.status === 'ready_check') {
    return match.me.state === 'ready'
      ? 'Ты готов. Ждём готовность соперника, после этого период стартует с карточки или из раздела дуэлей.'
      : 'Нажми кнопку, чтобы подтвердить готовность и зафиксировать экипировку.';
  }
  if (match.status === 'active') {
    if (match.me.state === 'period_active') return 'Можно играть: кнопка броска активна.';
    if (canStartArenaDuelPeriod(match, nowMs))
      return 'Нажми кнопку, чтобы начать свой текущий период.';
    if (match.opponent.state === 'period_active')
      return 'Сейчас играет соперник. Твой бросок будет доступен после его периода или перерыва.';
    if (match.me.state === 'completed' || match.me.state === 'forfeit')
      return 'Ты уже завершил свою часть. Ждём соперника или авторасчёт.';
    if (match.me.state === 'break_active') return 'Идёт перерыв между периодами.';
    return 'Дуэль активна, но сейчас нет доступного действия для твоей стороны.';
  }
  if (match.status === 'settled') return 'Можно открыть результат дуэли.';
  return 'Эта дуэль уже неигровая: она отменена или истекла.';
}

function DuelDevStatePanel({
  match,
  now,
}: {
  match: AmateurDuelMatch;
  now: number;
}): JSX.Element | null {
  if (!import.meta.env.DEV) return null;
  if (!new URLSearchParams(window.location.search).has('debugDuel')) return null;
  const nowMs = duelMatchNowMs(match, now);
  const timing = duelEventTiming(match, now);

  return (
    <aside
      aria-label="Проверка состояния дуэли"
      style={{
        position: 'fixed',
        left: 14,
        right: 14,
        bottom: 'calc(84px + max(10px, var(--app-safe-bottom)))',
        zIndex: 720,
        maxWidth: 480,
        margin: '0 auto',
        borderRadius: 18,
        padding: '12px 14px',
        background: 'rgba(225, 238, 249, 0.92)',
        border: '1px solid rgba(255,255,255,0.82)',
        boxShadow: '0 16px 38px rgba(15, 23, 42, 0.18)',
        backdropFilter: 'blur(18px) saturate(140%)',
        WebkitBackdropFilter: 'blur(18px) saturate(140%)',
        color: 'var(--ink)',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 950, letterSpacing: '0.1em', opacity: 0.62 }}>
        DEV · СОСТОЯНИЕ ДУЭЛИ
      </div>
      <div
        style={{
          marginTop: 8,
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 8,
          fontSize: 12,
          fontWeight: 850,
          lineHeight: 1.25,
        }}
      >
        <span>Матч: {duelOutcomeText(match)}</span>
        <span>
          Таймер: {timing.value} · {duelCurrentTimerLabel(match)}
        </span>
        <span>Вы: {duelParticipantStateText(match.me.state)}</span>
        <span>Соперник: {duelParticipantStateText(match.opponent.state)}</span>
      </div>
      <div
        style={{
          marginTop: 8,
          color: 'rgba(15, 23, 42, 0.68)',
          fontSize: 12,
          fontWeight: 750,
          lineHeight: 1.35,
        }}
      >
        {duelDevHint(match, nowMs)}
      </div>
    </aside>
  );
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

function formatSeasonKeyLabel(seasonKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(seasonKey);
  if (!match) return seasonKey;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return seasonKey;
  return new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
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
        gridColumn: '2 / 3',
        gridRow: '2',
        justifySelf: 'start',
        maxWidth: '100%',
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
        overflow: 'hidden',
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
          flex: '0 0 auto',
        }}
      />
      <span
        style={{
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {status}
      </span>
    </span>
  );
}

function AmateurTournamentsPage({ onBack }: { onBack: () => void }): JSX.Element {
  return (
    <ModeShell title="Турниры" onBack={onBack} variant="section-hub">
      <TournamentCatalog />
    </ModeShell>
  );
}

function AmateurHubPage({
  onBack,
  onOpenSection,
}: {
  onBack: () => void;
  onOpenSection: (section: 'duels' | 'bonus-games' | 'tournaments') => void;
}): JSX.Element {
  const bonusCatalog = useQuery({
    queryKey: ['bonus-games'],
    queryFn: fetchBonusGames,
  });
  const bonusProgress = bonusCatalog.isError
    ? 'Прогресс недоступен'
    : bonusCatalog.data
      ? `${bonusCatalog.data.games.filter((game) => game.is_completed).length}/${bonusCatalog.data.games.length} пройдено`
      : '—/— пройдено';
  const sections = [
    {
      id: 'duels' as const,
      title: 'Дуэли',
      description: 'Матчи один на один',
      artwork: '/modes/amateur-duel-card.webp',
    },
    {
      id: 'bonus-games' as const,
      title: 'Бонусные игры',
      description: bonusProgress,
      artwork: '/bonus-games/section-card.webp',
    },
    {
      id: 'tournaments' as const,
      title: 'Турниры',
      description: 'Соревнования и турнирная сетка',
      artwork: '/modes/tournaments.webp',
    },
  ];

  return (
    <ModeShell title="Любители" onBack={onBack} variant="section-hub">
      <div className="amateur-hub-grid" aria-label="Разделы любителей">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            className="section-card-surface amateur-hub-card"
            aria-label={section.title}
            onClick={() => onOpenSection(section.id)}
          >
            <span className="amateur-hub-card__art" aria-hidden="true">
              <img src={section.artwork} alt="" draggable={false} />
            </span>
            <span className="amateur-hub-card__copy">
              <strong>{section.title}</strong>
              <span>{section.description}</span>
            </span>
            <ChevronRight className="card-chevron" size={20} strokeWidth={2.7} aria-hidden="true" />
          </button>
        ))}
      </div>
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
    <div className="duel-kind-picker" style={{ borderRadius: 16, padding: '10px 10px 12px' }}>
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
        minWidth: 0,
        minHeight: 30,
        borderRadius: 999,
        border: active ? '1px solid rgba(15,23,42,0.32)' : '1px solid rgba(255,255,255,0.7)',
        background: active ? 'rgba(31,42,61,0.92)' : 'rgba(255,255,255,0.46)',
        color: active ? '#fff' : 'var(--ink)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 9px',
        fontSize: 10,
        fontWeight: 900,
        lineHeight: 1,
        letterSpacing: '0',
        boxShadow: 'none',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
      }}
    >
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
  const [historyFilter, setHistoryFilter] = useState<DuelHistoryFilter>('current');
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
    queryFn: () => fetchAmateurRating(),
  });
  const currentSeasonKey = rating.data?.season_key ?? currentMoscowSeasonKey();
  const selectedHistorySeasonKey =
    historyFilter === 'current'
      ? currentSeasonKey
      : historyFilter === 'all'
        ? undefined
        : historyFilter;
  const historyQuery = useQuery({
    queryKey: ['amateur-duel', 'history', selectedHistorySeasonKey ?? 'all'],
    queryFn: () => fetchAmateurHistory(selectedHistorySeasonKey),
    enabled: duelTab === 'history',
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
  const acceptInviteMut = useMutation({
    mutationFn: (matchId: string) => acceptAmateurDuel(matchId),
    onSuccess: (_res, matchId) => {
      void queryClient.invalidateQueries({ queryKey: ['amateur-duel'] });
      onOpenMatch(matchId);
    },
  });
  const declineInviteMut = useMutation({
    mutationFn: (matchId: string) => declineAmateurDuel(matchId),
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
  const filteredHistory = historyQuery.data?.matches ?? [];
  const historyStats = historyQuery.data?.stats ?? duelHistoryStats(filteredHistory);
  const historySeasons = Array.from(
    new Set([currentSeasonKey, ...(historyQuery.data?.seasons ?? [])]),
  );
  const historyFilterItems = [
    { id: 'current', label: 'Текущий месяц' },
    ...historySeasons
      .filter((seasonKey) => seasonKey !== currentSeasonKey)
      .map((seasonKey) => ({ id: seasonKey, label: formatSeasonKeyLabel(seasonKey) })),
    { id: 'all', label: 'Всё время' },
  ];
  const historyRatingPlace =
    selectedHistorySeasonKey !== undefined ? (historyQuery.data?.rating_place ?? null) : null;
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
    <ModeShell title="Дуэли" onBack={onBack} variant="section-hub">
      <SegmentedTabs
        ariaLabel="Разделы дуэлей"
        activeTab={duelTab}
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
          <section
            className="mode-setup-card duel-creation-card"
            aria-label="Новая дуэль"
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            <div className="section-label section-label--page">Новая дуэль</div>
            <SegmentedTabs
              ariaLabel="Сценарий новой дуэли"
              activeTab={duelCreationMode}
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
                className="glass"
                style={{
                  minHeight: 132,
                  borderRadius: 22,
                  padding: 16,
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
              const canAnswerInvite = isDuelInviteForMe(match);
              return (
                <DuelListCard
                  key={match.id}
                  match={match}
                  onOpen={() => onOpenMatch(match.id)}
                  {...(canAnswerInvite
                    ? {
                        onAcceptInvite: () => acceptInviteMut.mutate(match.id),
                        onDeclineInvite: () => declineInviteMut.mutate(match.id),
                        inviteAnswerPending:
                          (acceptInviteMut.isPending && acceptInviteMut.variables === match.id) ||
                          (declineInviteMut.isPending && declineInviteMut.variables === match.id),
                      }
                    : {})}
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
                  gridTemplateColumns: '24px minmax(0, 1fr) auto',
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
                <span>Игрок</span>
                <span>Очки</span>
              </div>
              {(rating.data?.rating ?? []).map((row, index) => {
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
                      gridTemplateColumns: '24px minmax(0, 1fr) auto',
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
          <GlassSelect
            ariaLabel="Месяц истории дуэлей"
            value={historyFilter}
            options={historyFilterItems.map((item) => ({
              value: item.id,
              label: item.label,
            }))}
            onChange={setHistoryFilter}
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                selectedHistorySeasonKey !== undefined ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)',
              gap: 8,
            }}
          >
            <TotalCell label="ДУЭЛИ" value={String(historyStats.duels)} />
            <TotalCell label="ПОБЕДЫ" value={String(historyStats.wins)} />
            <TotalCell label="ОЧКИ" value={String(historyStats.points)} />
            {selectedHistorySeasonKey !== undefined && (
              <TotalCell
                label="МЕСТО"
                value={historyRatingPlace !== null ? `#${historyRatingPlace}` : '—'}
              />
            )}
          </div>
          {historyQuery.isLoading ? (
            <div
              style={{
                color: 'rgba(15, 23, 42, 0.68)',
                fontSize: 16,
                fontWeight: 700,
                lineHeight: 1.35,
              }}
            >
              Загрузка истории...
            </div>
          ) : filteredHistory.length === 0 ? (
            <div
              style={{
                color: 'rgba(15, 23, 42, 0.68)',
                fontSize: 16,
                fontWeight: 700,
                lineHeight: 1.35,
              }}
            >
              {selectedHistorySeasonKey
                ? `За ${formatSeasonKeyLabel(selectedHistorySeasonKey)} сыгранных дуэлей пока нет.`
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
          text="Здесь выбирается купленный инвентарь для дуэлей: одна клюшка, одна пара коньков и одно питание. Если предметов нет, их можно купить в магазине."
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
  const queryClient = useQueryClient();
  const [selectedKind, setSelectedKind] = useState<InventoryEquipmentKind | null>(null);
  const inventoryQuery = useQuery<InventoryState>({
    queryKey: ['inventory', 'me'],
    queryFn: fetchMyInventory,
  });
  const equipmentMut = useMutation<
    InventoryState,
    Error,
    { kind: InventoryEquipmentKind; itemId: string | null }
  >({
    mutationFn: ({ kind, itemId }) =>
      patchEquipment({ [DUEL_EQUIPMENT_META[kind].patchKey]: itemId }),
    onSuccess: (inventory) => {
      queryClient.setQueryData(['inventory', 'me'], inventory);
    },
  });

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
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 8,
          }}
        >
          {DUEL_INVENTORY_SLOTS.map((slot) => (
            <DuelLockerSlotButton
              key={slot.kind}
              kind={slot.kind}
              inventory={inventoryQuery.data}
              onOpen={() => setSelectedKind(slot.kind)}
            />
          ))}
        </div>
      </section>
      <button type="button" className="btn btn--cta" onClick={onOpenInventory}>
        В магазин
      </button>
      {selectedKind !== null && (
        <DuelEquipmentDetailsModal
          kind={selectedKind}
          inventory={inventoryQuery.data}
          isSaving={equipmentMut.isPending}
          error={equipmentMut.isError ? equipmentMut.error.message : null}
          onOpenShop={() => {
            equipmentMut.reset();
            setSelectedKind(null);
            onOpenInventory();
          }}
          onClose={() => {
            equipmentMut.reset();
            setSelectedKind(null);
          }}
          onSelect={(itemId) => {
            const kind = selectedKind;
            equipmentMut.mutate(
              { kind, itemId },
              {
                onSuccess: () => setSelectedKind(null),
              },
            );
          }}
        />
      )}
    </>
  );
}

function DuelLockerSlotButton({
  kind,
  inventory,
  onOpen,
}: {
  kind: InventoryEquipmentKind;
  inventory: InventoryState | undefined;
  onOpen: () => void;
}): JSX.Element {
  const meta = DUEL_EQUIPMENT_META[kind];
  const items = (inventory?.items[kind] ?? []).filter(isDuelLockerItemAvailable);
  const activeItem = duelEquippedItem(inventory, kind);
  const hasBaseEquipment = isDuelRequiredEquipment(kind);
  const hasOwnedItems = items.length > 0;
  const title = activeItem
    ? duelEquipmentDisplayTitle(activeItem)
    : hasBaseEquipment
      ? duelBaseEquipmentTitle(kind)
      : meta.empty;
  const status = activeItem
    ? formatInventoryStockLabel(activeItem)
    : hasBaseEquipment
      ? 'Базовая'
      : hasOwnedItems
        ? 'Выбрать'
        : 'Нет купленных';
  const artwork = activeItem
    ? artworkForInventoryItem(activeItem)
    : placeholderArtworkForKind(kind);
  const hasVisibleEquipment = activeItem !== null || hasBaseEquipment;

  return (
    <button
      type="button"
      className="glass"
      onClick={onOpen}
      aria-label={`${meta.title}: ${title}. ${status}`}
      style={{
        minWidth: 0,
        minHeight: 158,
        borderRadius: 22,
        padding: 10,
        border: hasVisibleEquipment
          ? '1px solid rgba(255,255,255,0.82)'
          : '1px solid rgba(255,255,255,0.62)',
        display: 'grid',
        gridTemplateRows: '1fr auto',
        gap: 8,
        color: 'var(--ink)',
        textAlign: 'left',
        cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: '100%',
          aspectRatio: '1 / 1',
          borderRadius: 18,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.78)',
          background: 'rgba(255,255,255,0.28)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.78), 0 10px 18px rgba(15,23,42,0.1)',
        }}
      >
        <img
          src={artwork}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            objectFit: 'cover',
            filter: hasVisibleEquipment ? 'none' : 'grayscale(1)',
            opacity: hasVisibleEquipment ? 1 : 0.46,
          }}
        />
      </span>
      <span style={{ minWidth: 0, display: 'grid', gap: 4 }}>
        <span
          style={{
            minWidth: 0,
            color: 'var(--ink)',
            fontSize: 12,
            fontWeight: 950,
            lineHeight: 1.08,
            overflowWrap: 'break-word',
          }}
        >
          {title}
        </span>
        <span
          style={{
            color: 'rgba(15, 23, 42, 0.6)',
            fontSize: 10,
            fontWeight: 850,
            lineHeight: 1.1,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {status}
        </span>
      </span>
    </button>
  );
}

function DuelEquipmentSelectionRadio({ selected }: { selected: boolean }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 18,
        height: 18,
        borderRadius: 999,
        border: selected ? '5px solid rgba(255,255,255,0.92)' : '2px solid rgba(15,23,42,0.34)',
        background: selected ? '#1f2a3d' : 'rgba(255,255,255,0.36)',
        boxShadow: selected
          ? '0 0 0 1px rgba(15,23,42,0.2)'
          : 'inset 0 1px 0 rgba(255,255,255,0.62)',
        justifySelf: 'end',
      }}
    />
  );
}

function DuelEquipmentDetailsModal({
  kind,
  inventory,
  isSaving,
  error,
  onSelect,
  onOpenShop,
  onClose,
}: {
  kind: InventoryEquipmentKind;
  inventory: InventoryState | undefined;
  isSaving: boolean;
  error: string | null;
  onSelect: (itemId: string | null) => void;
  onOpenShop: () => void;
  onClose: () => void;
}): JSX.Element {
  const meta = DUEL_EQUIPMENT_META[kind];
  const items = (inventory?.items[kind] ?? []).filter(isDuelLockerItemAvailable);
  const activeId = duelEquipmentIdFor(inventory, kind);
  const showBaseEquipment = kind !== 'stick';

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 420 }}>
      <section
        role="dialog"
        aria-label={meta.title}
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(430px, calc(100vw - 28px))',
          maxHeight: 'calc(100dvh - 112px - var(--app-safe-top) - var(--app-safe-bottom))',
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr) auto',
          gap: 10,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <button
          type="button"
          className="icon-btn"
          aria-label="Закрыть"
          onClick={onClose}
          style={{ position: 'absolute', top: 14, right: 14 }}
        >
          <X size={15} />
        </button>
        <div style={{ minWidth: 0, paddingRight: 42 }}>
          <div className="modal-title">{meta.title}</div>
          <div className="modal-copy">{duelEquipmentModalCopy(kind)}</div>
        </div>

        <div
          className="no-scrollbar"
          style={{
            minHeight: 0,
            maxHeight: 'min(54dvh, 430px)',
            overflowY: 'auto',
            display: 'grid',
            gap: 8,
            paddingRight: 2,
          }}
        >
          {showBaseEquipment && (
            <button
              type="button"
              data-no-drag-scroll="true"
              disabled={isSaving}
              onClick={() => onSelect(null)}
              className="glass"
              aria-pressed={activeId === null}
              style={{
                minHeight: 74,
                borderRadius: 16,
                padding: 10,
                color: activeId === null ? '#fff' : 'var(--ink)',
                border:
                  activeId === null
                    ? '1px solid rgba(255,255,255,0.24)'
                    : '1px solid rgba(255,255,255,0.76)',
                background:
                  activeId === null
                    ? 'linear-gradient(180deg, rgba(15,23,42,0.92), rgba(30,41,59,0.86))'
                    : 'rgba(255,255,255,0.22)',
                boxShadow:
                  activeId === null
                    ? 'inset 0 1px 0 rgba(255,255,255,0.12), 0 10px 22px rgba(15,23,42,0.22)'
                    : undefined,
                display: 'grid',
                gridTemplateColumns: '54px minmax(0, 1fr) 22px',
                alignItems: 'center',
                gap: 10,
                textAlign: 'left',
                cursor: isSaving ? 'wait' : 'pointer',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 14,
                  overflow: 'hidden',
                  border:
                    activeId === null
                      ? '1px solid rgba(255,255,255,0.34)'
                      : '1px solid rgba(255,255,255,0.78)',
                  background: 'rgba(255,255,255,0.28)',
                }}
              >
                <img
                  src={placeholderArtworkForKind(kind)}
                  alt=""
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    objectFit: 'cover',
                    filter: 'grayscale(0.45)',
                    opacity: 0.72,
                  }}
                />
              </span>
              <span style={{ minWidth: 0, display: 'grid', gap: 5 }}>
                <span style={{ minWidth: 0, fontSize: 15, fontWeight: 950, lineHeight: 1.12 }}>
                  {duelBaseEquipmentTitle(kind)}
                </span>
                <span
                  style={{
                    color: activeId === null ? 'rgba(255,255,255,0.76)' : 'rgba(15, 23, 42, 0.62)',
                    fontSize: 12,
                    fontWeight: 760,
                    lineHeight: 1.28,
                  }}
                >
                  {duelEquipmentEffectLabel(kind, 0)}
                </span>
              </span>
              <DuelEquipmentSelectionRadio selected={activeId === null} />
            </button>
          )}

          {items.map((item) => {
            const selected = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                data-no-drag-scroll="true"
                disabled={isSaving || item.chargesAvailable <= 0}
                onClick={() => onSelect(item.id)}
                aria-pressed={selected}
                className="glass"
                style={{
                  minHeight: 94,
                  borderRadius: 18,
                  padding: 10,
                  color: selected ? '#fff' : 'var(--ink)',
                  border: selected
                    ? '1px solid rgba(255,255,255,0.24)'
                    : '1px solid rgba(255,255,255,0.76)',
                  background: selected
                    ? 'linear-gradient(180deg, rgba(15,23,42,0.92), rgba(30,41,59,0.86))'
                    : 'rgba(255,255,255,0.22)',
                  boxShadow: selected
                    ? 'inset 0 1px 0 rgba(255,255,255,0.12), 0 10px 22px rgba(15,23,42,0.22)'
                    : undefined,
                  display: 'grid',
                  gridTemplateColumns: '64px minmax(0, 1fr) 22px',
                  alignItems: 'center',
                  gap: 10,
                  textAlign: 'left',
                  cursor: isSaving ? 'wait' : 'pointer',
                  opacity: item.chargesAvailable > 0 ? 1 : 0.55,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 16,
                    overflow: 'hidden',
                    border: '1px solid rgba(255,255,255,0.8)',
                    background: 'rgba(255,255,255,0.28)',
                    boxShadow:
                      'inset 0 1px 0 rgba(255,255,255,0.8), 0 10px 18px rgba(15,23,42,0.12)',
                  }}
                >
                  <img
                    src={artworkForInventoryItem(item)}
                    alt=""
                    style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
                  />
                </span>
                <span style={{ minWidth: 0, display: 'grid', gap: 5 }}>
                  <span
                    style={{
                      minWidth: 0,
                      color: selected ? '#fff' : 'var(--ink)',
                      fontSize: 15,
                      fontWeight: 950,
                      lineHeight: 1.12,
                      overflowWrap: 'break-word',
                    }}
                  >
                    {duelEquipmentDisplayTitle(item)}
                  </span>
                  <span
                    style={{
                      display: 'grid',
                      gap: 2,
                      color: selected ? 'rgba(255,255,255,0.76)' : 'rgba(15, 23, 42, 0.62)',
                      fontSize: 12,
                      fontWeight: 760,
                      lineHeight: 1.25,
                    }}
                  >
                    <span>
                      {duelEquipmentEffectLabel(
                        kind,
                        item.powerScore,
                        item.chargesAvailable,
                        item.resourceUnit,
                      )}
                    </span>
                    <span style={duelEquipmentStockLineStyle(selected)}>
                      {formatInventoryStockLabel(item)}
                    </span>
                  </span>
                </span>
                <DuelEquipmentSelectionRadio selected={selected} />
              </button>
            );
          })}

          {items.length === 0 && (
            <div
              className="glass"
              style={{ borderRadius: 18, padding: 14, display: 'grid', gap: 10 }}
            >
              <div style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 800 }}>
                Купленных предметов этого типа пока нет.
              </div>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={onOpenShop}
                style={{ width: '100%', minHeight: 46, fontSize: 13, fontWeight: 850 }}
              >
                В магазин
              </button>
            </div>
          )}
        </div>

        {error !== null && (
          <div role="alert" style={{ color: 'var(--red-deep)', fontSize: 13, fontWeight: 800 }}>
            {error}
          </div>
        )}
      </section>
    </div>
  );
}

function DuelListCard({
  match,
  onOpen,
  onAcceptInvite,
  onDeclineInvite,
  inviteAnswerPending = false,
  onCancelInvite,
  cancelInvitePending = false,
}: {
  match: AmateurDuelMatch;
  onOpen: () => void;
  onAcceptInvite?: () => void;
  onDeclineInvite?: () => void;
  inviteAnswerPending?: boolean;
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
        gridTemplateColumns: onCancelInvite ? '42px minmax(0, 1fr) 34px' : '42px minmax(0, 1fr)',
        gridTemplateRows: 'auto auto',
        alignItems: 'center',
        columnGap: 10,
        rowGap: 6,
      }}
    >
      <UserAvatar
        avatarUrl={match.opponent.avatar_url}
        name={match.opponent.display_name}
        size={42}
        fontSize={16}
        style={{
          gridColumn: '1 / 2',
          gridRow: '1 / span 2',
          border: '1px solid rgba(255,255,255,0.78)',
          boxShadow: '0 10px 18px rgba(15,23,42,0.16)',
        }}
      />
      <div style={{ gridColumn: '2 / 3', gridRow: '1', minWidth: 0 }}>
        <div
          style={{
            fontWeight: 900,
            color: 'var(--ink)',
            fontSize: 15,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {match.opponent.display_name}
        </div>
        <div
          style={{
            color: 'var(--muted)',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          <span>
            {duelKindText(match.rules.duelKind)}
            {opensOnCardClick
              ? ` · ${formatShortDateTime(historyDate)}`
              : ` · ${match.me.goals}:${match.opponent.goals}`}
          </span>
          <VenueBadge role={match.venue_role} />
        </div>
      </div>
      <DuelStatusBadge match={match} />
      {onAcceptInvite && onDeclineInvite && (
        <div
          onClick={(event) => event.stopPropagation()}
          style={{
            gridColumn: '1 / -1',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            marginTop: 2,
          }}
        >
          <button
            type="button"
            className="btn btn--ghost"
            disabled={inviteAnswerPending}
            onClick={onDeclineInvite}
            style={{ minHeight: 36, fontSize: 12 }}
          >
            Отклонить
          </button>
          <button
            type="button"
            className="btn btn--cta"
            disabled={inviteAnswerPending}
            onClick={onAcceptInvite}
            style={{ minHeight: 36, fontSize: 12 }}
          >
            Принять
          </button>
        </div>
      )}
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
            gridColumn: '3 / 4',
            gridRow: '1 / span 2',
            justifySelf: 'end',
            width: 34,
            height: 34,
            minWidth: 34,
            minHeight: 34,
            alignSelf: 'center',
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
  const updateLoadout = useAmateurDuelStore((s) => s.updateLoadout);
  const optimisticAddShot = useAmateurDuelStore((s) => s.optimisticAddShot);
  const submitShot = useAmateurDuelStore((s) => s.submitShot);
  const applyState = useAmateurDuelStore((s) => s.applyState);
  const [now, setNow] = useState(Date.now());
  const [dismissedResultMatchId, setDismissedResultMatchId] = useState<string | null>(null);
  const [selectedLoadout, setSelectedLoadout] = useState<AmateurDuelLoadoutSelection>({});
  const [selectedLoadoutKind, setSelectedLoadoutKind] = useState<InventoryEquipmentKind | null>(
    null,
  );
  const [playerReadyEntranceKey, setPlayerReadyEntranceKey] = useState<string | null>(null);
  const [goalieReadyEntranceKey, setGoalieReadyEntranceKey] = useState<string | null>(null);
  const previousReadyStateRef = useRef<{ me: boolean; opponent: boolean } | null>(null);
  const inventoryQuery = useQuery<InventoryState>({
    queryKey: ['inventory', 'me'],
    queryFn: fetchMyInventory,
    enabled: Boolean(matchId),
  });

  useEffect(() => {
    void load(matchId);
  }, [load, matchId]);

  useEffect(() => {
    setDismissedResultMatchId(null);
    setSelectedLoadout({});
    previousReadyStateRef.current = null;
    setPlayerReadyEntranceKey(null);
    setGoalieReadyEntranceKey(null);
  }, [matchId]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const inventory = inventoryQuery.data;
    if (!inventory) return;
    setSelectedLoadout((current) => ({
      stick: current.stick === undefined ? duelEquipmentIdFor(inventory, 'stick') : current.stick,
      skates:
        current.skates === undefined ? duelEquipmentIdFor(inventory, 'skates') : current.skates,
      nutrition:
        current.nutrition === undefined
          ? duelEquipmentIdFor(inventory, 'nutrition')
          : current.nutrition,
    }));
  }, [inventoryQuery.data, matchId]);

  useEffect(() => {
    if (!match || match.id !== matchId) return;
    const { playerReady: meReady, goalieReady: opponentReady } =
      duelRinkReadyPresenceForMatch(match);
    const previous = previousReadyStateRef.current;
    if (previous && !previous.me && meReady) {
      setPlayerReadyEntranceKey(match.me.ready_at ?? match.me.period_started_at ?? match.id);
    }
    if (previous && !previous.opponent && opponentReady) {
      setGoalieReadyEntranceKey(
        match.opponent.ready_at ?? match.opponent.period_started_at ?? match.id,
      );
    }
    previousReadyStateRef.current = { me: meReady, opponent: opponentReady };
  }, [match, matchId]);

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
  const handleDirectDuelAction = async (): Promise<void> => {
    if (inFlight) return;
    const matchNow = duelMatchNowMs(match, now);
    if (match.status === 'ready_check' && match.me.state !== 'ready') {
      await ready(selectedLoadout);
      return;
    }
    if (canStartArenaDuelPeriod(match, matchNow)) {
      await startPeriod(duelStartPeriodLoadoutSelection(match, selectedLoadout));
    }
  };
  const nextPeriod =
    match.me.state === 'period_active'
      ? match.me.current_period
      : Math.min(match.rules.totalPeriods, match.me.current_period + 1);
  const nextPeriodRule = currentDuelPeriodRule(match);
  const opponentDisplayName = match.opponent.display_name || 'Игрок';
  const duelCondition = (elapsedMs: number, speeds: SpeedOverrides): DuelPlayerCondition | null =>
    duelConditionForMatch(match, elapsedMs, speeds);
  const liveDuelCondition =
    match.me.state === 'period_active'
      ? duelCondition(
          computeInitialElapsedMs({
            sessionStartedAt: match.period_started_at,
            serverNow: match.server_now,
            receivedAtPerformanceMs: match.received_at_performance_ms ?? null,
          }),
          speedOverridesForPeriod(match.me.current_period, match.period_speed_presets),
        )
      : null;
  const handleActiveLoadoutSelect = async (itemId: string | null): Promise<void> => {
    if (selectedLoadoutKind !== 'stick') return;
    const next = await updateLoadout({ stick: itemId });
    if (next) setSelectedLoadoutKind(null);
  };

  if (directPlayOnly && match.me.state !== 'period_active') {
    const timing = duelEventTiming(match, now);
    const inactivePeriodRule = duelParticipantPeriodRule(match, match.me);
    const showDirectResultModal = match.status === 'settled' && dismissedResultMatchId !== match.id;
    const canRunDirectDuelAction =
      (match.status === 'ready_check' && match.me.state !== 'ready') ||
      canStartArenaDuelPeriod(match, duelMatchNowMs(match, now));
    const { playerReady: meReady, goalieReady: opponentReady } =
      duelRinkReadyPresenceForMatch(match);
    return (
      <>
        <PlayView<AmateurDuelMatchState>
          suppressedByModal={false}
          showIceCar={false}
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
          shotButtonLabel={
            inFlight ? 'ФИКСИРУЕМ...' : duelRinkPrimaryLabel(match, now).toUpperCase()
          }
          inactiveAction={canRunDirectDuelAction ? handleDirectDuelAction : undefined}
          readyPresence={{
            playerReady: meReady,
            goalieReady: opponentReady,
            playerEntranceKey: playerReadyEntranceKey,
            goalieEntranceKey: goalieReadyEntranceKey,
          }}
          backLabel={duelBackLabel(match.source, true)}
          optimisticAddShot={optimisticAddShot}
          submitShot={submitShot}
          applyState={applyState}
          duelCondition={duelCondition}
          longCourtBackground={match.source === 'tournament' ? match.arena.artwork_url : undefined}
          hudAddon={
            <DuelRinkLoadoutHud
              match={match}
              selectedLoadout={selectedLoadout}
              locked={(match.status === 'ready_check' && meReady) || inFlight}
              onSelectKind={setSelectedLoadoutKind}
            />
          }
          scoreboardGoals={match.me.goals}
          scoreboardOpponent={duelScoreboardOpponent(match)}
        />
        {showDirectResultModal && <DuelResultModal match={match} onClose={onBack} />}
        {selectedLoadoutKind !== null && (
          <DuelRinkLoadoutModal
            kind={selectedLoadoutKind}
            match={match}
            selectedId={selectedLoadout[selectedLoadoutKind] ?? null}
            onClose={() => setSelectedLoadoutKind(null)}
            onSelect={(itemId) => {
              const kind = selectedLoadoutKind;
              setSelectedLoadout((current) => ({ ...current, [kind]: itemId }));
              setSelectedLoadoutKind(null);
            }}
          />
        )}
        <DuelDevStatePanel match={match} now={now} />
      </>
    );
  }

  if (match.status === 'ready_check') {
    const readyEndsAt = match.ready_expires_at ? new Date(match.ready_expires_at).getTime() : 0;
    const readyText = readyEndsAt > now ? formatMs(readyEndsAt - now) : '00:00';
    const meReady = match.me.state === 'ready';
    const opponentReady = match.opponent.state === 'ready';
    const readyTimerLabel = meReady ? 'ЖДЁМ' : opponentReady ? 'ДО ПОРАЖЕНИЯ' : 'ГОТОВ';
    const readyLead = meReady
      ? `Вы готовы. Ждём, пока ${opponentDisplayName} выберет инвентарь и нажмёт «Готов».`
      : opponentReady
        ? `${opponentDisplayName} уже готов. У вас идёт отсчёт до технического поражения: выберите инвентарь и нажмите «Готов».`
        : `Соперник: ${opponentDisplayName}. Выберите инвентарь и нажмите «Готов».`;
    return (
      <ModeShell title="Комната дуэли" onBack={onBack}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <TotalCell label="ФОРМАТ" value={`${match.rules.totalPeriods}П`} />
          <TotalCell label="ТИП" value={duelKindText(match.rules.duelKind)} />
          <TotalCell label={readyTimerLabel} value={readyText} />
        </div>
        <div
          className="glass"
          style={{
            borderRadius: 18,
            padding: 14,
            border:
              opponentReady && !meReady
                ? '1px solid rgba(245, 158, 11, 0.42)'
                : '1px solid rgba(255,255,255,0.76)',
            background:
              opponentReady && !meReady
                ? 'linear-gradient(180deg, rgba(255, 247, 237, 0.58), rgba(255,255,255,0.2))'
                : undefined,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--ink)', marginBottom: 6 }}>
            {match.rules.title}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.45 }}>{readyLead}</div>
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
      <>
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
          scoreboardGoals={match.me.goals}
          shots={match.current_period_shots}
          shotsTotal={
            activePeriodRule.mode === 'quota' ? (activePeriodRule.shotsLimit ?? 30) : undefined
          }
          periodEndsAt={periodEndsAt}
          onTimerExpired={refresh}
          backLabel={duelBackLabel(match.source, false)}
          optimisticAddShot={optimisticAddShot}
          submitShot={submitShot}
          applyState={applyState}
          duelCondition={duelCondition}
          longCourtBackground={match.source === 'tournament' ? match.arena.artwork_url : undefined}
          hudAddon={
            <DuelInventoryMiniHud
              match={match}
              liveCondition={liveDuelCondition}
              onSelectKind={setSelectedLoadoutKind}
            />
          }
          scoreboardOpponent={duelScoreboardOpponent(match)}
        />
        {selectedLoadoutKind === 'stick' && (
          <DuelRinkLoadoutModal
            kind="stick"
            match={match}
            selectedId={match.me.loadout.items.find((item) => item.kind === 'stick')?.id ?? null}
            onClose={() => setSelectedLoadoutKind(null)}
            onSelect={(itemId) => {
              void handleActiveLoadoutSelect(itemId);
            }}
          />
        )}
      </>
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
          onStart={() => void startPeriod(duelStartPeriodLoadoutSelection(match, selectedLoadout))}
        />
      )}
      <button
        type="button"
        className="btn btn--cta"
        disabled={!canStart || inFlight}
        onClick={() => void startPeriod(duelStartPeriodLoadoutSelection(match, selectedLoadout))}
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
  const tiebreaker = duelTiebreakerExplanation(match);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Результат дуэли">
      <div
        className="modal-card"
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
          {tiebreaker && (
            <>
              <DuelResultDetailRow label={tiebreaker.label} value={tiebreaker.value} />
              <DuelResultDetailRow label="Итог" value={tiebreaker.result} />
            </>
          )}
          {match.rules.winStarReward > 0 && (
            <DuelResultDetailRow
              label="Звёзды за победу"
              value={`+${match.rules.winStarReward}`}
              tone="star"
            />
          )}
          <DuelResultDetailRow label="Начало" value={formatShortDateTime(match.starts_at)} />
        </div>
        <DuelInventoryUsageSummary
          match={match}
          title="Общий расход инвентаря"
          label="Общий расход инвентаря"
          style={{ marginTop: 14 }}
        />
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
                match={match}
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

function duelTiebreakerExplanation(
  match: AmateurDuelMatch,
): { label: string; value: string; result: string } | null {
  if (match.status !== 'settled' || match.me.goals !== match.opponent.goals) return null;
  if (usesAccuracyTiebreaker(match) && compareDuelAccuracy(match) !== 0) {
    const meAccuracy = duelAccuracy(match.me);
    const opponentAccuracy = duelAccuracy(match.opponent);
    const iAmMoreAccurate = meAccuracy > opponentAccuracy;
    return {
      label: 'Решил процент',
      value: `${meAccuracy}% / ${opponentAccuracy}%`,
      result: iAmMoreAccurate
        ? 'Победа за счёт лучшего процента'
        : 'Поражение из-за процента соперника',
    };
  }
  const meSeconds = Math.round(match.me.active_duration_ms / 1000);
  const opponentSeconds = Math.round(match.opponent.active_duration_ms / 1000);
  const value = `${formatDurationMs(meSeconds * 1000)} / ${formatDurationMs(
    opponentSeconds * 1000,
  )}`;
  if (meSeconds === opponentSeconds) {
    return { label: 'Решило время', value, result: 'Время одинаковое' };
  }
  const diffText = formatTiebreakerDiff(Math.abs(meSeconds - opponentSeconds));
  return {
    label: 'Решило время',
    value,
    result:
      meSeconds < opponentSeconds ? `Вы быстрее на ${diffText}` : `Соперник быстрее на ${diffText}`,
  };
}

function usesAccuracyTiebreaker(match: AmateurDuelMatch): boolean {
  return (
    match.rules.duelKind === 'express' ||
    match.rules.periodRules.every((rule) => rule.mode === 'time_attack')
  );
}

function duelAccuracy(participant: AmateurDuelMatch['me']): number {
  return participant.shots_taken > 0
    ? Math.round((participant.goals / participant.shots_taken) * 100)
    : 0;
}

function compareDuelAccuracy(match: AmateurDuelMatch): number {
  const meShots = Math.max(0, match.me.shots_taken);
  const opponentShots = Math.max(0, match.opponent.shots_taken);
  const left = match.me.goals * (opponentShots === 0 ? 1 : opponentShots);
  const right = match.opponent.goals * (meShots === 0 ? 1 : meShots);
  return Math.sign(left - right);
}

function formatTiebreakerDiff(seconds: number): string {
  if (seconds < 60) return `${seconds} сек`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} мин` : `${minutes} мин ${rest} сек`;
}

function hasDuelPeriodDetails(match: AmateurDuelMatch): match is AmateurDuelMatchState {
  return 'recent_periods' in match && 'opponent_recent_periods' in match;
}

function DuelResultPeriodComparison({
  match,
  totalPeriods,
  mePeriods,
  opponentPeriods,
  opponentName,
}: {
  match: AmateurDuelMatch;
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
                {hasMultiplePeriods && (
                  <DuelInventoryUsageSummary
                    match={match}
                    periodNumber={periodNumber}
                    title="Расход за период"
                    label={`${periodNumber}-й период: расход инвентаря`}
                    compact
                    style={{ gridColumn: '1 / -1' }}
                  />
                )}
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

function DuelResultDetailRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'star';
}): JSX.Element {
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
      <span
        style={{
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          color: tone ? rewardColor(tone) : undefined,
        }}
      >
        {value}
      </span>
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
  const opponentStatus = duelOpponentStatus(match);
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

function duelOpponentStatus(match: AmateurDuelMatch): {
  label: string;
  color: string;
  glow: string;
} {
  const participant = match.opponent;
  if (match.status === 'invited') {
    return {
      label: match.me.side === 'challenger' ? 'ждём ответ' : 'ждёт ответ',
      color: '#f59e0b',
      glow: 'rgba(245, 158, 11, 0.2)',
    };
  }
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
      <DuelInventoryUsageSummary match={match} />
    </div>
  );
}

function DuelInventoryUsageSummary({
  match,
  periodNumber,
  title = 'Расход в этой дуэли',
  label,
  compact = false,
  style,
}: {
  match: AmateurDuelMatch;
  periodNumber?: number;
  title?: string;
  label?: string;
  compact?: boolean;
  style?: CSSProperties;
}): JSX.Element | null {
  const usage = duelInventoryUsageRows(match, periodNumber);
  if (usage.length === 0) return null;
  return (
    <div aria-label={label ?? title} style={{ display: 'grid', gap: compact ? 5 : 6, ...style }}>
      <div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 900 }}>{title}</div>
      <div style={{ display: 'grid', gap: 5 }}>
        {usage.map((item) => (
          <div
            key={`${item.kind}:${item.id}`}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
              fontSize: compact ? 11 : 12,
              lineHeight: 1.25,
            }}
          >
            <span style={{ color: 'var(--muted)', fontWeight: 750 }}>{item.title}</span>
            <span style={{ color: 'var(--ink)', fontWeight: 900, textAlign: 'right' }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function duelScoreboardOpponent(match: AmateurDuelMatch): ScoreBoardOpponent {
  const opponent = match.opponent;
  const activeTime = opponent.active_duration_ms > 0 ? formatMs(opponent.active_duration_ms) : null;
  const opponentRule = duelParticipantPeriodRule(match, opponent);
  const shotsLabel =
    opponent.state === 'period_active' &&
    opponentRule.mode === 'quota' &&
    opponentRule.shotsLimit !== null
      ? `${String(opponent.current_period_shots).padStart(2, '0')}/${String(
          opponentRule.shotsLimit,
        ).padStart(2, '0')}`
      : undefined;
  const time =
    opponent.state === 'period_active'
      ? `играет ${opponent.current_period}/${match.rules.totalPeriods}`
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
    shotsLabel,
    time,
    timeTone,
  };
}

const DUEL_INVENTORY_SLOTS = [
  { kind: 'skates', label: 'Коньки' },
  { kind: 'stick', label: 'Клюшка' },
  { kind: 'nutrition', label: 'Энергия' },
] as const;

const DUEL_INVENTORY_ICON_GLASS_STYLE: CSSProperties = {
  background:
    'radial-gradient(circle at 28% 0%, rgba(255,255,255,0.94), rgba(255,255,255,0) 42%), linear-gradient(145deg, rgba(255,255,255,0.76), rgba(226,242,250,0.5) 58%, rgba(255,255,255,0.64))',
  border: '1px solid rgba(255,255,255,0.82)',
  boxShadow:
    '0 0 0 1px rgba(15,23,42,0.07), 0 8px 18px rgba(15,23,42,0.14), inset 0 1.5px 0 rgba(255,255,255,0.88), inset 0 -8px 16px rgba(15,23,42,0.06)',
  backdropFilter: 'blur(14px) saturate(1.24)',
  WebkitBackdropFilter: 'blur(14px) saturate(1.24)',
};

const DUEL_EQUIPMENT_META: Record<
  InventoryEquipmentKind,
  { title: string; empty: string; patchKey: 'stickItemId' | 'skatesItemId' | 'nutritionItemId' }
> = {
  stick: { title: 'Клюшка', empty: 'Без клюшки', patchKey: 'stickItemId' },
  skates: { title: 'Коньки', empty: 'Без коньков', patchKey: 'skatesItemId' },
  nutrition: { title: 'Питание', empty: 'Без питания', patchKey: 'nutritionItemId' },
};

function duelEquipmentIdFor(
  inventory: InventoryState | undefined,
  kind: InventoryEquipmentKind,
): string | null {
  if (!inventory?.equipped) return null;
  if (kind === 'stick') return inventory.equipped.stickItemId;
  if (kind === 'skates') return inventory.equipped.skatesItemId;
  return inventory.equipped.nutritionItemId;
}

function duelEquippedItem(
  inventory: InventoryState | undefined,
  kind: InventoryEquipmentKind,
): InventoryItem | null {
  const id = duelEquipmentIdFor(inventory, kind);
  return inventory?.items[kind].find((item) => item.id === id) ?? null;
}

function isDuelRequiredEquipment(kind: InventoryEquipmentKind): boolean {
  return kind === 'stick' || kind === 'skates';
}

function isDuelLockerItemAvailable(item: InventoryItem): boolean {
  return item.chargesAvailable + item.chargesReserved > 0;
}

function duelBaseEquipmentTitle(kind: InventoryEquipmentKind): string {
  if (kind === 'stick') return 'Обычная клюшка';
  if (kind === 'skates') return 'Обычные коньки';
  return 'Без питания';
}

function duelInventoryStockLabel(item: AmateurDuelInventoryAvailabilityItem): string {
  if (item.chargesAvailable <= 0) return 'Нет запаса';
  return `Осталось ${formatInventoryResourceAmount(item.kind, item.chargesAvailable, item.resourceUnit)}`;
}

function duelEquipmentModalCopy(kind: InventoryEquipmentKind): string {
  if (kind === 'stick') {
    return 'Выберите клюшку, с которой будете начинать матчи. Перед стартом игры выбор можно изменить';
  }
  return 'Выберите купленный предмет для активного слота.';
}

function duelEquipmentStockLineStyle(selected: boolean): CSSProperties {
  return {
    display: 'inline-block',
    marginTop: 3,
    color: selected ? 'rgba(255,255,255,0.92)' : '#334155',
    fontSize: 12,
    fontWeight: 920,
    lineHeight: 1.15,
  };
}

function duelEquipmentPointLabel(value: number): string {
  const normalized = Math.max(0, Math.trunc(value));
  const mod10 = normalized % 10;
  const mod100 = normalized % 100;
  const noun =
    mod10 === 1 && mod100 !== 11
      ? 'пункт'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'пункта'
        : 'пунктов';
  return `${normalized} ${noun}`;
}

export function duelEquipmentEffectLabel(
  kind: InventoryEquipmentKind,
  powerScore: number | undefined,
  resourceAmount?: number,
  resourceUnit?:
    | AmateurDuelLoadoutItem['resourceUnit']
    | AmateurDuelInventoryAvailabilityItem['resourceUnit'],
): string {
  if (kind === 'skates') {
    return resourceAmount !== undefined && resourceAmount > 0
      ? 'Защищают от спотыканий'
      : 'Возможны спотыкания';
  }
  if (kind === 'nutrition') {
    return resourceAmount !== undefined && resourceAmount > 0
      ? `Запас энергии: ${formatInventoryBadgeAmount(kind, resourceAmount, resourceUnit)}`
      : 'Без дополнительной энергии';
  }
  const score = Math.max(0, Math.trunc(powerScore ?? 0));
  if (score <= 0) {
    if (kind === 'stick') return 'Базовая скорость полёта шайбы';
  }
  if (kind === 'stick') return `Ускоряет полёт шайбы на ${duelEquipmentPointLabel(score)}`;
  return 'Базовая скорость полёта шайбы';
}

export function duelInventoryBadgeLabel(
  kind: InventoryEquipmentKind,
  remaining: number,
  resourceUnit?:
    | AmateurDuelLoadoutItem['resourceUnit']
    | AmateurDuelInventoryAvailabilityItem['resourceUnit'],
): string | null {
  const normalized = Math.max(0, Math.floor(remaining));
  if (normalized <= 0) return null;
  return formatInventoryBadgeAmount(kind, normalized, resourceUnit);
}

export function isDuelInventoryLow(
  kind: InventoryEquipmentKind,
  remaining: number,
  lowStockThreshold?: number,
): boolean {
  const threshold = Math.max(0, Math.floor(lowStockThreshold ?? (kind === 'stick' ? 10 : 0)));
  return threshold > 0 && remaining > 0 && remaining <= threshold;
}

function duelStartPeriodLoadoutSelection(
  match: AmateurDuelMatch,
  selectedLoadout: AmateurDuelLoadoutSelection,
): AmateurDuelLoadoutSelection | undefined {
  if (selectedLoadout.stick === undefined) return undefined;
  const selectedStick = selectedDuelAvailabilityItem(match, 'stick', selectedLoadout.stick);
  return { stick: selectedStick ? selectedStick.id : null };
}

function duelEquipmentDisplayTitle(item: Pick<InventoryItem, 'kind' | 'rarity' | 'title'>): string {
  const normalized = item.title.trim().toLowerCase();
  const isGenericTitle = new Set(['клюшка', 'клюшки', 'коньки', 'питание', 'энергия']).has(
    normalized,
  );
  if (!isGenericTitle) return item.title;

  const tier = item.rarity === 'legendary' || item.rarity === 'epic' ? 'gold' : item.rarity;
  if (item.kind === 'stick') {
    if (tier === 'gold') return 'Золотая клюшка';
    if (tier === 'rare') return 'Серебряная клюшка';
    return 'Бронзовая клюшка';
  }
  if (item.kind === 'skates') {
    if (tier === 'gold') return 'Золотые коньки';
    if (tier === 'rare') return 'Серебряные коньки';
    return 'Бронзовые коньки';
  }
  if (tier === 'gold') return 'Золотое питание';
  if (tier === 'rare') return 'Серебряное питание';
  return 'Бронзовое питание';
}

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
        const artwork = item
          ? artworkForInventoryItem(item)
          : available
            ? artworkForInventoryItem(available)
            : placeholderArtworkForKind(slot.kind);
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
                ...DUEL_INVENTORY_ICON_GLASS_STYLE,
                opacity: item || hasAvailable ? 1 : 0.56,
              }}
            >
              <img
                src={artwork}
                alt=""
                style={{
                  width: iconSize,
                  height: iconSize,
                  objectFit: 'cover',
                  filter: hasAvailable || item ? 'none' : 'grayscale(1)',
                  opacity: item ? 1 : hasAvailable ? 0.78 : 0.42,
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
                {item
                  ? formatInventoryResourceAmount(
                      item.kind,
                      duelInventoryItemRemaining(match, item),
                      item.resourceUnit,
                    )
                  : emptyText}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function availableDuelItemsForKind(
  match: AmateurDuelMatch,
  kind: InventoryEquipmentKind,
): AmateurDuelInventoryAvailabilityItem[] {
  return (match.me.inventory_available ?? []).filter(
    (item) => item.kind === kind && item.chargesAvailable > 0,
  );
}

function selectedDuelAvailabilityItem(
  match: AmateurDuelMatch,
  kind: InventoryEquipmentKind,
  selectedId: string | null | undefined,
): AmateurDuelInventoryAvailabilityItem | null {
  if (!selectedId) return null;
  return availableDuelItemsForKind(match, kind).find((item) => item.id === selectedId) ?? null;
}

function DuelRinkLoadoutHud({
  match,
  selectedLoadout,
  locked,
  onSelectKind,
}: {
  match: AmateurDuelMatch;
  selectedLoadout: AmateurDuelLoadoutSelection;
  locked: boolean;
  onSelectKind: (kind: InventoryEquipmentKind) => void;
}): JSX.Element {
  return (
    <div
      aria-label="Выбор инвентаря"
      style={{
        display: 'flex',
        gap: 9,
        pointerEvents: locked ? 'none' : 'auto',
      }}
    >
      {DUEL_INVENTORY_SLOTS.map((slot) => {
        const selectedId = selectedLoadout[slot.kind] ?? null;
        const item = selectedDuelAvailabilityItem(match, slot.kind, selectedId);
        const availableItems = availableDuelItemsForKind(match, slot.kind);
        const hasBase = isDuelRequiredEquipment(slot.kind);
        const hasVisibleEquipment = item !== null || hasBase;
        const canOpen = !locked && availableItems.length > 0;
        const inventoryBadge = item
          ? duelInventoryBadgeLabel(item.kind, item.chargesAvailable, item.resourceUnit)
          : null;
        const inventoryLow =
          item !== null &&
          isDuelInventoryLow(slot.kind, item.chargesAvailable, item.lowStockThreshold);
        const title = item ? duelEquipmentDisplayTitle(item) : duelBaseEquipmentTitle(slot.kind);
        const status = item
          ? formatInventoryResourceAmount(item.kind, item.chargesAvailable, item.resourceUnit)
          : hasBase
            ? 'базовый предмет'
            : 'не выбрано';
        return (
          <button
            key={slot.kind}
            type="button"
            aria-label={`${slot.label}: ${title}. ${status}`}
            className={inventoryLow ? 'inventory-icon-pulse' : undefined}
            disabled={!canOpen}
            onClick={() => onSelectKind(slot.kind)}
            style={{
              position: 'relative',
              width: 31,
              height: 31,
              borderRadius: 999,
              overflow: 'visible',
              padding: 0,
              display: 'block',
              ...DUEL_INVENTORY_ICON_GLASS_STYLE,
              boxShadow: hasVisibleEquipment
                ? DUEL_INVENTORY_ICON_GLASS_STYLE.boxShadow
                : '0 0 0 1px rgba(15,23,42,0.04), inset 0 1px 0 rgba(255,255,255,0.5)',
              opacity: hasVisibleEquipment ? 1 : 0.48,
              cursor: canOpen ? 'pointer' : 'default',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <img
              src={item ? artworkForInventoryItem(item) : placeholderArtworkForKind(slot.kind)}
              alt=""
              style={{
                width: '100%',
                height: '100%',
                display: 'block',
                borderRadius: 999,
                objectFit: 'cover',
                filter: hasVisibleEquipment ? 'none' : 'grayscale(1)',
                opacity: item ? 1 : hasVisibleEquipment ? 0.72 : 0.38,
              }}
            />
            {inventoryBadge && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: -16,
                  minWidth: 'max-content',
                  transform: 'translateX(-50%)',
                  display: 'block',
                  color: '#16233b',
                  fontFamily: 'var(--font-ui)',
                  fontSize: 9.5,
                  fontWeight: 950,
                  lineHeight: 1,
                  letterSpacing: 0,
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  textShadow: '0 1px 0 rgba(255,255,255,0.92), 0 0 6px rgba(255,255,255,0.78)',
                  zIndex: 2,
                }}
              >
                {inventoryBadge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function DuelRinkLoadoutModal({
  kind,
  match,
  selectedId,
  onClose,
  onSelect,
}: {
  kind: InventoryEquipmentKind;
  match: AmateurDuelMatch;
  selectedId: string | null;
  onClose: () => void;
  onSelect: (itemId: string | null) => void;
}): JSX.Element {
  const meta = DUEL_EQUIPMENT_META[kind];
  const items = availableDuelItemsForKind(match, kind);
  const canUseBase = kind !== 'stick' && (isDuelRequiredEquipment(kind) || kind === 'nutrition');

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 420 }}>
      <section
        role="dialog"
        aria-label={meta.title}
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(430px, calc(100vw - 28px))',
          maxHeight: 'calc(100dvh - 112px - var(--app-safe-top) - var(--app-safe-bottom))',
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr)',
          gap: 10,
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="modal-title">{meta.title}</div>
            <div className="modal-copy">{duelEquipmentModalCopy(kind)}</div>
          </div>
          <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
        <div
          className="no-scrollbar"
          style={{
            minHeight: 0,
            maxHeight: 'min(54dvh, 430px)',
            overflowY: 'auto',
            display: 'grid',
            gap: 8,
            paddingRight: 2,
          }}
        >
          {canUseBase && (
            <button
              type="button"
              className="glass"
              aria-pressed={selectedId === null}
              onClick={() => onSelect(null)}
              style={{
                minHeight: 74,
                borderRadius: 16,
                padding: 10,
                display: 'grid',
                gridTemplateColumns: '54px minmax(0, 1fr) 22px',
                alignItems: 'center',
                gap: 10,
                color: selectedId === null ? '#fff' : 'var(--ink)',
                textAlign: 'left',
                border:
                  selectedId === null
                    ? '1px solid rgba(255,255,255,0.24)'
                    : '1px solid rgba(255,255,255,0.76)',
                background:
                  selectedId === null
                    ? 'linear-gradient(180deg, rgba(15,23,42,0.92), rgba(30,41,59,0.86))'
                    : undefined,
                boxShadow:
                  selectedId === null
                    ? 'inset 0 1px 0 rgba(255,255,255,0.12), 0 10px 22px rgba(15,23,42,0.22)'
                    : undefined,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 14,
                  overflow: 'hidden',
                  border:
                    selectedId === null
                      ? '1px solid rgba(255,255,255,0.34)'
                      : '1px solid rgba(255,255,255,0.78)',
                  background: 'rgba(255,255,255,0.28)',
                }}
              >
                <img
                  src={placeholderArtworkForKind(kind)}
                  alt=""
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    objectFit: 'cover',
                    filter: 'grayscale(0.45)',
                    opacity: 0.72,
                  }}
                />
              </span>
              <span style={{ minWidth: 0, display: 'grid', gap: 5 }}>
                <span style={{ minWidth: 0, fontSize: 15, fontWeight: 950, lineHeight: 1.12 }}>
                  {duelBaseEquipmentTitle(kind)}
                </span>
                <span
                  style={{
                    display: 'block',
                    color: selectedId === null ? 'rgba(255,255,255,0.76)' : 'var(--muted)',
                    fontSize: 12,
                    fontWeight: 760,
                    lineHeight: 1.25,
                  }}
                >
                  {duelEquipmentEffectLabel(kind, 0)}
                </span>
              </span>
              <DuelEquipmentSelectionRadio selected={selectedId === null} />
            </button>
          )}
          {items.map((item) => {
            const selected = item.id === selectedId;
            return (
              <button
                key={item.id}
                type="button"
                className="glass"
                aria-pressed={selected}
                onClick={() => onSelect(item.id)}
                style={{
                  minHeight: 94,
                  borderRadius: 18,
                  padding: 10,
                  display: 'grid',
                  gridTemplateColumns: '64px minmax(0, 1fr) 22px',
                  alignItems: 'center',
                  gap: 10,
                  color: selected ? '#fff' : 'var(--ink)',
                  textAlign: 'left',
                  border: selected
                    ? '1px solid rgba(255,255,255,0.24)'
                    : '1px solid rgba(255,255,255,0.76)',
                  background: selected
                    ? 'linear-gradient(180deg, rgba(15,23,42,0.92), rgba(30,41,59,0.86))'
                    : undefined,
                  boxShadow: selected
                    ? 'inset 0 1px 0 rgba(255,255,255,0.12), 0 10px 22px rgba(15,23,42,0.22)'
                    : undefined,
                }}
              >
                <img
                  src={artworkForInventoryItem(item)}
                  alt=""
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 16,
                    objectFit: 'cover',
                    border: selected
                      ? '1px solid rgba(255,255,255,0.34)'
                      : '1px solid rgba(255,255,255,0.78)',
                  }}
                />
                <span style={{ minWidth: 0, display: 'grid', gap: 5 }}>
                  <span
                    style={{
                      minWidth: 0,
                      display: 'block',
                      fontSize: 15,
                      fontWeight: 950,
                      lineHeight: 1.12,
                      overflowWrap: 'break-word',
                    }}
                  >
                    {duelEquipmentDisplayTitle(item)}
                  </span>
                  <span
                    style={{
                      display: 'grid',
                      gap: 2,
                      color: selected ? 'rgba(255,255,255,0.76)' : 'var(--muted)',
                      fontSize: 12,
                      fontWeight: 760,
                      lineHeight: 1.25,
                    }}
                  >
                    <span>
                      {duelEquipmentEffectLabel(
                        kind,
                        item.powerScore,
                        item.chargesAvailable,
                        item.resourceUnit,
                      )}
                    </span>
                    <span style={duelEquipmentStockLineStyle(selected)}>
                      {duelInventoryStockLabel(item)}
                    </span>
                  </span>
                </span>
                <DuelEquipmentSelectionRadio selected={selected} />
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function duelInventoryUsageRows(
  match: AmateurDuelMatch,
  periodNumber?: number,
): Array<{
  id: string;
  kind: AmateurDuelMatch['me']['loadout']['items'][number]['kind'];
  title: string;
  label: string;
}> {
  const totals = new Map<
    string,
    {
      id: string;
      kind: AmateurDuelMatch['me']['loadout']['items'][number]['kind'];
      title: string;
      charges: number;
    }
  >();
  for (const consumed of match.me.inventory_report
    .filter((report) => periodNumber === undefined || report.periodNumber === periodNumber)
    .flatMap((report) => report.consumed)) {
    const key = `${consumed.kind}:${consumed.id}`;
    const current = totals.get(key);
    if (current) {
      current.charges += consumed.charges;
    } else {
      totals.set(key, {
        id: consumed.id,
        kind: consumed.kind,
        title: consumed.title,
        charges: consumed.charges,
      });
    }
  }
  return [...totals.values()]
    .filter((item) => item.charges > 0)
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      label: formatInventoryResourceAmount(
        item.kind,
        item.kind === 'skates' ? Math.floor(item.charges) : item.charges,
        item.kind === 'stick' ? 'shot' : item.kind === 'skates' ? 'distance' : 'energy_ms',
      ),
    }));
}

function duelInventoryRemaining(match: AmateurDuelMatch, itemId: string, fallback: number): number {
  for (let index = match.me.inventory_report.length - 1; index >= 0; index -= 1) {
    const report = match.me.inventory_report[index];
    const consumed = report?.consumed.find((cur) => cur.id === itemId);
    if (consumed) return consumed.remainingReserved;
  }
  return fallback;
}

export function duelInventoryItemRemaining(
  match: AmateurDuelMatch,
  item: AmateurDuelMatch['me']['loadout']['items'][number],
  liveCondition?: DuelPlayerCondition | null,
): number {
  if (item.resourceUnit === 'shot') {
    return Math.max(0, (item.resourceAvailable ?? 0) - duelConsumedForItem(match, item.id));
  }
  if (item.resourceUnit === 'distance' || item.resourceUnit === 'energy_ms') {
    const periodNumber = Math.max(1, match.me.current_period);
    const currentPeriodConsumed = duelConsumedForPeriodItem(match, periodNumber, item.id);
    const liveConsumed =
      item.resourceUnit === 'distance'
        ? (liveCondition?.skatesConsumed ?? 0)
        : (liveCondition?.nutritionConsumed ?? 0);
    return Math.max(
      0,
      (item.resourceAvailable ?? 0) -
        duelConsumedBeforePeriodItem(match, periodNumber, item.id) -
        Math.max(currentPeriodConsumed, liveConsumed),
    );
  }
  return duelInventoryRemaining(match, item.id, item.chargesReserved);
}

function duelConsumedForPeriodItem(
  match: AmateurDuelMatch,
  periodNumber: number,
  itemId: string,
): number {
  return match.me.inventory_report
    .filter((report) => report.periodNumber === periodNumber)
    .flatMap((report) => report.consumed)
    .filter((item) => item.id === itemId)
    .reduce((sum, item) => sum + item.charges, 0);
}

function duelConsumedBeforePeriodItem(
  match: AmateurDuelMatch,
  periodNumber: number,
  itemId: string,
): number {
  return match.me.inventory_report
    .filter((report) => report.periodNumber < periodNumber)
    .flatMap((report) => report.consumed)
    .filter((item) => item.id === itemId)
    .reduce((sum, item) => sum + item.charges, 0);
}

function duelConsumedForItem(match: AmateurDuelMatch, itemId: string): number {
  return match.me.inventory_report
    .flatMap((report) => report.consumed)
    .filter((item) => item.id === itemId)
    .reduce((sum, item) => sum + item.charges, 0);
}

function duelConditionLoadout(match: AmateurDuelMatch): DuelInventoryLoadoutSnapshot {
  const periodNumber = Math.max(1, match.me.current_period);
  const stick = match.me.loadout.items.find((item) => item.kind === 'stick');
  const skates = match.me.loadout.items.find((item) => item.kind === 'skates');
  const nutrition = match.me.loadout.items.find((item) => item.kind === 'nutrition');
  const toConditionItem = (
    item: typeof stick,
    resourceAvailable: number,
  ): DuelInventoryLoadoutSnapshot['stick'] => {
    if (!item || item.resourceUnit === undefined) return null;
    const resourceUnit =
      item.kind === 'stick' && item.resourceUnit === 'period' ? 'shot' : item.resourceUnit;
    if (resourceUnit === 'period') return null;
    return {
      id: item.id,
      title: item.title,
      resourceUnit,
      resourceAvailable: Math.max(0, resourceAvailable),
      effectPuckSpeedPoints: item.effectPuckSpeedPoints ?? 0,
      timing: item.timing ?? DEFAULT_DUEL_INVENTORY_TIMING,
    };
  };
  const stickConsumed = stick ? duelConsumedForItem(match, stick.id) : 0;
  const skatesConsumedBeforePeriod = skates
    ? duelConsumedBeforePeriodItem(match, periodNumber, skates.id)
    : 0;
  const nutritionConsumedBeforePeriod = nutrition
    ? duelConsumedBeforePeriodItem(match, periodNumber, nutrition.id)
    : 0;
  return {
    stick: toConditionItem(stick, (stick?.resourceAvailable ?? 0) - stickConsumed),
    skates: toConditionItem(skates, (skates?.resourceAvailable ?? 0) - skatesConsumedBeforePeriod),
    nutrition: toConditionItem(
      nutrition,
      (nutrition?.resourceAvailable ?? 0) - nutritionConsumedBeforePeriod,
    ),
    fallbackSkatesTiming: match.rules.noInventoryTiming?.skates ?? DEFAULT_DUEL_INVENTORY_TIMING,
    fallbackNutritionTiming:
      match.rules.noInventoryTiming?.nutrition ?? DEFAULT_DUEL_INVENTORY_TIMING,
  };
}

function duelConditionForMatch(
  match: AmateurDuelMatchState,
  elapsedMs: number,
  speeds: SpeedOverrides,
): DuelPlayerCondition | null {
  if (!match.match_seed) return null;
  const basePreset = periodSpeedPresetFor(match.me.current_period, match.rules.periodSpeedPresets);
  return getDuelPlayerCondition({
    seed: match.match_seed,
    userId: match.me.user_id,
    periodNumber: match.me.current_period,
    elapsedMs: Math.max(0, elapsedMs),
    movementDistancePx: movementDistancePxForElapsed(elapsedMs, speeds.shooterFreq),
    baseLaneWidthPx: SHOOTER_AMPLITUDE * 2,
    baselineShooterSpeed: basePreset.shooterFrequency,
    currentShooterSpeed: speeds.shooterFreq,
    loadout: duelConditionLoadout(match),
  });
}

function DuelInventoryMiniHud({
  match,
  liveCondition,
  onSelectKind,
}: {
  match: AmateurDuelMatch;
  liveCondition?: DuelPlayerCondition | null;
  onSelectKind?: (kind: InventoryEquipmentKind) => void;
}): JSX.Element | null {
  const availableItems = match.me.inventory_available ?? [];

  return (
    <div
      aria-label="Инвентарь дуэли"
      style={{
        display: 'flex',
        justifyContent: 'flex-start',
        gap: 9,
        pointerEvents: onSelectKind ? 'auto' : 'none',
      }}
    >
      {DUEL_INVENTORY_SLOTS.map((slot) => {
        const selectedItem = match.me.loadout.items.find((cur) => cur.kind === slot.kind);
        const selectedRemaining = selectedItem
          ? duelInventoryItemRemaining(match, selectedItem, liveCondition)
          : 0;
        const item =
          selectedItem && !(slot.kind === 'stick' && selectedRemaining <= 0)
            ? selectedItem
            : undefined;
        const available = availableItems.find(
          (cur) => cur.kind === slot.kind && cur.chargesAvailable > 0,
        );
        const artwork = item
          ? artworkForInventoryItem(item)
          : available
            ? artworkForInventoryItem(available)
            : placeholderArtworkForKind(slot.kind);
        const remainingCharges = item ? duelInventoryItemRemaining(match, item, liveCondition) : 0;
        const isSelected = item !== undefined;
        const inventoryBadge = item
          ? duelInventoryBadgeLabel(item.kind, remainingCharges, item.resourceUnit)
          : null;
        const inventoryLow =
          item !== undefined &&
          isDuelInventoryLow(slot.kind, remainingCharges, item.lowStockThreshold);
        const statusText = isSelected
          ? formatInventoryResourceAmount(item.kind, remainingCharges, item.resourceUnit)
          : available
            ? 'не выбрано'
            : slot.kind === 'nutrition'
              ? 'нет'
              : 'обычный';
        const interactive = slot.kind === 'stick' && Boolean(onSelectKind);

        return (
          <button
            key={slot.kind}
            type="button"
            aria-label={`${slot.label}: ${statusText}`}
            disabled={!interactive}
            onClick={() => onSelectKind?.(slot.kind)}
            className={inventoryLow ? 'inventory-icon-pulse' : undefined}
            style={{
              appearance: 'none',
              padding: 0,
              position: 'relative',
              width: 31,
              height: 31,
              borderRadius: 999,
              overflow: 'visible',
              display: 'block',
              cursor: interactive ? 'pointer' : 'default',
              ...DUEL_INVENTORY_ICON_GLASS_STYLE,
              border: '1px solid rgba(255,255,255,0.82)',
              boxShadow: isSelected
                ? '0 0 0 1px rgba(255,255,255,0.72), 0 10px 22px rgba(15,23,42,0.18), inset 0 1.5px 0 rgba(255,255,255,0.92), inset 0 -8px 16px rgba(15,23,42,0.07)'
                : DUEL_INVENTORY_ICON_GLASS_STYLE.boxShadow,
            }}
          >
            <img
              src={artwork}
              alt=""
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                borderRadius: 999,
                objectFit: 'cover',
                filter: isSelected || available ? 'none' : 'grayscale(1)',
                opacity: isSelected ? 1 : available ? 0.72 : 0.34,
              }}
            />
            {inventoryBadge && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: -16,
                  minWidth: 'max-content',
                  transform: 'translateX(-50%)',
                  display: 'block',
                  color: '#16233b',
                  fontFamily: 'var(--font-ui)',
                  fontSize: 9.5,
                  fontWeight: 950,
                  lineHeight: 1,
                  letterSpacing: 0,
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  textShadow: '0 1px 0 rgba(255,255,255,0.92), 0 0 6px rgba(255,255,255,0.78)',
                  zIndex: 2,
                }}
              >
                {inventoryBadge}
              </span>
            )}
          </button>
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
  return (
    <ModeShell title={level === 'amateur' ? 'Любители' : 'Профессионалы'} onBack={onBack}>
      <div className="level-placeholder-copy">Раздел в разработке</div>
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
      aria-label={`${label}: ${value}`}
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

interface DailyStatsModalState {
  stats: DailyGameStats;
  source: 'deferred' | 'state';
  state: DailyStateResponse['state'];
}

function DailyPlayView({
  onBack,
  backLabel = 'К режимам',
  playEntranceOnMount = false,
  onEntranceConsumed,
  playRouteTransitionOnMount = false,
  onRouteTransitionConsumed,
}: {
  onBack: () => void;
  backLabel?: string;
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
  const profileQuery = useQuery<ProfileData>({
    queryKey: ['profile'],
    queryFn: () => apiFetch<ProfileData>('/me'),
  });
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
  const amateurUnlockGoalsRequired = Math.max(
    0,
    data.amateur_unlock_goals_required ?? DEFAULT_AMATEUR_UNLOCK_GOALS_REQUIRED,
  );
  const dailyCourtBackground =
    profileQuery.data?.competitionLevel === 'amateur' ||
    profileQuery.data?.competitionLevel === 'professional' ||
    data.lifetime_total_goals >= amateurUnlockGoalsRequired
      ? AMATEUR_DAILY_COURT_BACKGROUND
      : undefined;
  const trainingCooldownEndsAt = data.training_cooldown_ends_at
    ? new Date(data.training_cooldown_ends_at).getTime()
    : 0;
  const trainingCooldownRemaining = Math.max(0, trainingCooldownEndsAt - now);
  const isDailyLockedByTraining =
    rawCanStartPeriod && trainingCooldownEndsAt > 0 && trainingCooldownRemaining > 0;
  const canStartPeriod = rawCanStartPeriod && !isDailyLockedByTraining;
  const shouldSuppressRink = data.state !== 'period_active' || hasStatsModal;
  const shouldShowIceCar = isBreak || isClosed || hasStatsModal || isDailyLockedByTraining;
  const handleStartPeriod = useCallback(async (): Promise<DailyStateResponse | null> => {
    if (!canStartPeriod || pending) return null;
    return startPeriod();
  }, [canStartPeriod, pending, startPeriod]);

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
        backLabel={backLabel}
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
        scoreboardNotice={isDailyLockedByTraining ? 'Нужно восстановиться' : undefined}
        shotButtonLabel={
          canStartPeriod
            ? pending
              ? 'НАЧИНАЕМ...'
              : 'НАЧАТЬ'
            : isBreak || isDailyLockedByTraining
              ? 'ЛЁД ГОТОВИТСЯ'
              : isClosed
                ? 'ИГРА ЗАВЕРШЕНА'
                : undefined
        }
        inactiveAction={canStartPeriod ? handleStartPeriod : undefined}
        entranceBeforeInactiveAction={true}
        periodEndsAt={data.state === 'period_active' ? periodEndsAt : undefined}
        onTimerExpired={refresh}
        optimisticAddShot={optimisticAddShot}
        submitShot={submitShot}
        applyState={applyState}
        applyResolvedState={applyDailyResolvedState}
        longCourtBackground={dailyCourtBackground}
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
    </>
  );
}

function ClassicTournamentPlayView({
  tournamentId,
  onBack,
}: {
  tournamentId: string;
  onBack: () => void;
}): JSX.Element {
  const data = useClassicTournamentStore((state) => state.data);
  const loading = useClassicTournamentStore((state) => state.loading);
  const error = useClassicTournamentStore((state) => state.error);
  const inFlight = useClassicTournamentStore((state) => state.inFlight);
  const refresh = useClassicTournamentStore((state) => state.refresh);
  const startPeriod = useClassicTournamentStore((state) => state.startPeriod);
  const optimisticAddShot = useClassicTournamentStore((state) => state.optimisticAddShot);
  const submitShot = useClassicTournamentStore((state) => state.submitShot);
  const applyState = useClassicTournamentStore((state) => state.applyState);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    void refresh(tournamentId);
  }, [refresh, tournamentId]);

  useEffect(() => {
    if (data?.state !== 'break_active' && data?.state !== 'closed') return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [data?.state]);

  if (data === null) {
    return (
      <main className="screen arena-error-state">
        {error ? (
          <>
            <div className="arena-error-state__title">Не удалось открыть игру</div>
            <div className="arena-error-state__copy">{error}</div>
            <button
              type="button"
              className="btn btn--cta"
              disabled={loading}
              onClick={() => void refresh(tournamentId)}
            >
              Повторить
            </button>
            <button type="button" className="btn btn--ghost" onClick={onBack}>
              К турниру
            </button>
          </>
        ) : (
          <div className="route-loading" role="status">
            Загружаем турнирную игру…
          </div>
        )}
      </main>
    );
  }

  const active = data.state === 'period_active';
  const breakEndsAt = data.break_ends_at ? timestampMs(data.break_ends_at) : 0;
  const periodEndsAt = data.period_ends_at ? timestampMs(data.period_ends_at) : 0;
  const closesAt = timestampMs(data.closes_at);
  const breakRemaining = Math.max(0, breakEndsAt - now);
  const closesRemaining = Math.max(0, closesAt - now);
  const canStart = data.state === 'idle' && data.current_period < data.total_periods;
  const nextPeriod = Math.min(data.total_periods, data.current_period + 1);
  const periodNumber = active ? data.current_period : canStart ? nextPeriod : data.current_period;
  const completedResult = data.result;

  return (
    <PlayView<ClassicTournamentState>
      suppressedByModal={!active}
      showIceCar={!active}
      onBack={onBack}
      backLabel="К турниру"
      active={active}
      seed={data.daily_seed}
      goalieId={data.goalie_id}
      periodNumber={Math.max(1, periodNumber)}
      periodSpeedPresets={data.period_speed_presets}
      sessionStartedAt={data.period_started_at}
      serverNow={data.server_now}
      receivedAtPerformanceMs={data.received_at_performance_ms}
      goals={active ? data.current_period_goals : data.daily_total_goals}
      scoreboardGoals={data.daily_total_goals}
      shots={active ? data.current_period_shots : data.daily_total_shots}
      shotsTotal={active ? data.shots_per_period : data.shots_per_period * data.total_periods}
      periodsTotal={data.total_periods}
      scoreboardPeriodsTotal={data.total_periods}
      timer={
        data.state === 'break_active'
          ? formatMs(breakRemaining)
          : data.state === 'closed'
            ? formatEventRemaining(closesRemaining)
            : canStart
              ? formatMs(data.period_duration_ms)
              : undefined
      }
      timerLabel={
        data.state === 'break_active'
          ? 'ПЕРЕРЫВ'
          : data.state === 'closed'
            ? 'ДО ЗАКРЫТИЯ'
            : canStart
              ? 'ВРЕМЯ'
              : undefined
      }
      scoreboardNotice={
        data.state === 'closed' && completedResult !== null
          ? `${completedResult.goals} шайб · точность ${Math.round(completedResult.accuracy * 100)}%`
          : `${data.tournament_title} · ${data.tournament_day}-й тур`
      }
      shotButtonLabel={
        canStart
          ? inFlight
            ? 'НАЧИНАЕМ...'
            : data.current_period === 0
              ? 'НАЧАТЬ'
              : 'ПРОДОЛЖИТЬ'
          : data.state === 'break_active'
            ? 'ЛЁД ГОТОВИТСЯ'
            : data.state === 'closed'
              ? 'ИГРА ЗАВЕРШЕНА'
              : undefined
      }
      inactiveAction={canStart ? startPeriod : undefined}
      entranceBeforeInactiveAction
      periodEndsAt={active && periodEndsAt > 0 ? periodEndsAt : undefined}
      onTimerExpired={() => refresh(tournamentId)}
      optimisticAddShot={optimisticAddShot}
      submitShot={submitShot}
      applyState={applyState}
      applyResolvedState={applyState}
      longCourtBackground={AMATEUR_DAILY_COURT_BACKGROUND}
    />
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
      aria-label="Хитбоксы"
      title="Хитбоксы"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        width: 34,
        height: 34,
        padding: 0,
        borderRadius: 999,
        background: checked ? 'rgba(8, 24, 43, 0.86)' : 'rgba(255, 255, 255, 0.82)',
        border: checked
          ? '1px solid rgba(255, 255, 255, 0.34)'
          : '1px solid rgba(15, 23, 42, 0.12)',
        boxShadow: checked
          ? '0 10px 22px rgba(7, 19, 33, 0.22)'
          : '0 8px 18px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255,255,255,0.86)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        color: checked ? '#ffffff' : 'rgba(15, 23, 42, 0.68)',
        cursor: 'pointer',
      }}
    >
      <input
        aria-label="Хитбоксы"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          margin: 0,
          opacity: 0,
          cursor: 'pointer',
          accentColor: '#22cc66',
        }}
      />
      <Crosshair aria-hidden="true" size={17} strokeWidth={2.4} />
    </label>
  );
}

type TrainingSpeedKey = keyof SpeedOverrides;

const TRAINING_SPEED_FIELDS: Array<{
  key: TrainingSpeedKey;
  label: string;
  min: number;
  max: number;
  step: number;
  suffix: string;
}> = [
  { key: 'shooterFreq', label: 'Игрок', min: 0.1, max: 3, step: 0.05, suffix: '/с' },
  { key: 'goalieFreq', label: 'Вратарь', min: 0.1, max: 3, step: 0.05, suffix: '/с' },
  { key: 'goalFreq', label: 'Ворота', min: 0.1, max: 3, step: 0.05, suffix: '/с' },
  { key: 'puckSpeed', label: 'Шайба', min: 0.2, max: 5, step: 0.05, suffix: '' },
];

function speedValueText(value: number, suffix: string): string {
  const formatted = value.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return suffix ? `${formatted}${suffix}` : formatted;
}

function TrainingSpeedControls({
  value,
  defaults,
  open,
  onOpen,
  onClose,
  onChange,
  onReset,
}: {
  value: SpeedOverrides;
  defaults: SpeedOverrides;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChange: (next: SpeedOverrides) => void;
  onReset: () => void;
}): JSX.Element {
  const hasCustomSpeeds = TRAINING_SPEED_FIELDS.some(
    (field) => Math.abs(value[field.key] - defaults[field.key]) > 0.001,
  );

  return (
    <>
      <button
        type="button"
        className="icon-btn"
        aria-label="Скорости"
        title="Скорости"
        onClick={onOpen}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 34,
          height: 34,
          padding: 0,
          borderRadius: 999,
          background: hasCustomSpeeds ? 'rgba(8, 24, 43, 0.86)' : 'rgba(255, 255, 255, 0.82)',
          border: hasCustomSpeeds
            ? '1px solid rgba(255, 255, 255, 0.34)'
            : '1px solid rgba(15, 23, 42, 0.12)',
          boxShadow: hasCustomSpeeds
            ? '0 10px 22px rgba(7, 19, 33, 0.22)'
            : '0 8px 18px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255,255,255,0.86)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          color: hasCustomSpeeds ? '#ffffff' : 'rgba(15, 23, 42, 0.68)',
          cursor: 'pointer',
        }}
      >
        <SlidersHorizontal aria-hidden="true" size={17} strokeWidth={2.4} />
      </button>
      {open &&
        createPortal(
          <div className="modal-backdrop" style={{ zIndex: 520 }} onClick={onClose}>
            <section
              role="dialog"
              aria-modal="true"
              aria-label="Скорости тренировки"
              className="modal-card"
              onClick={(event) => event.stopPropagation()}
              style={{ width: 'min(100%, 360px)', padding: '22px 20px 20px' }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <h2 className="modal-title">Скорости тренировки</h2>
                <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
                  <X size={16} />
                </button>
              </div>
              <div style={{ display: 'grid', gap: 16, marginTop: 18 }}>
                {TRAINING_SPEED_FIELDS.map((field) => (
                  <label key={field.key} style={{ display: 'grid', gap: 8 }}>
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        gap: 10,
                        color: 'var(--ink)',
                        fontSize: 13,
                        fontWeight: 900,
                      }}
                    >
                      <span>{field.label}</span>
                      <span
                        style={{
                          color: 'var(--muted)',
                          fontVariantNumeric: 'tabular-nums',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {speedValueText(value[field.key], field.suffix)}
                      </span>
                    </span>
                    <input
                      type="range"
                      aria-label={field.label}
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={value[field.key]}
                      onChange={(event) => {
                        const raw = Number(event.currentTarget.value);
                        const nextValue =
                          field.key === 'puckSpeed' ? clampPuckSpeed(raw) : clampFrequency(raw);
                        onChange({ ...value, [field.key]: nextValue });
                      }}
                      style={{ width: '100%', accentColor: '#162136' }}
                    />
                  </label>
                ))}
              </div>
              <div className="modal-actions" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <button type="button" className="btn btn--ghost" onClick={onReset}>
                  Сбросить
                </button>
                <button type="button" className="btn btn--cta" onClick={onClose}>
                  Готово
                </button>
              </div>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}

function TrainingPlayView({
  onBack,
  selectedPeriod = 1,
  playEntranceOnMount = false,
  onEntranceConsumed,
  playRouteTransitionOnMount = false,
  onRouteTransitionConsumed,
}: {
  onBack: () => void;
  selectedPeriod?: 1 | 2 | 3;
  playEntranceOnMount?: boolean;
  onEntranceConsumed?: () => void;
  playRouteTransitionOnMount?: boolean;
  onRouteTransitionConsumed?: (() => void) | undefined;
}): JSX.Element | null {
  const data = useTrainingSessionStore((s) => s.data);
  const dailyData = useDailyStore((s) => s.data);
  const start = useTrainingSessionStore((s) => s.start);
  const optimisticAddShot = useTrainingSessionStore((s) => s.optimisticAddShot);
  const submitShot = useTrainingSessionStore((s) => s.submitShot);
  const applyState = useTrainingSessionStore((s) => s.applyState);
  const refreshDaily = useDailyStore((s) => s.refresh);
  const userRole = useAuthStore((s) => s.user?.role);
  const experimentalTrainingCourt = useAuthStore((s) => s.user?.experimentalTrainingCourt);
  const [hitboxesVisible, setHitboxesVisible] = useState(() => readTrainingHitboxesVisible());
  const [speedControlsOpen, setSpeedControlsOpen] = useState(false);
  const [trainingSpeedOverrides, setTrainingSpeedOverrides] = useState<SpeedOverrides | null>(() =>
    readTrainingSpeedOverrides(),
  );
  const [now, setNow] = useState(Date.now());
  const canShowTrainingDebugControls =
    isDevTrainingDebugHost(window.location.hostname) ||
    userRole === 'admin' ||
    experimentalTrainingCourt === true;
  const trainingPeriodNumber = data?.selected_period ?? selectedPeriod;
  const trainingDefaultSpeeds = useMemo(
    () => speedOverridesForPeriod(trainingPeriodNumber, data?.period_speed_presets),
    [data?.period_speed_presets, trainingPeriodNumber],
  );
  const effectiveTrainingSpeeds = trainingSpeedOverrides ?? trainingDefaultSpeeds;
  const isTrainingLockedByDaily =
    dailyData?.state === 'period_active' ||
    dailyData?.state === 'break_active' ||
    (dailyData?.state === 'idle' &&
      dailyData.current_period > 0 &&
      dailyData.current_period < dailyData.total_periods);
  const canStartTraining = data?.state === 'idle' && !isTrainingLockedByDaily;
  const handleHitboxesChange = useCallback((next: boolean): void => {
    setHitboxesVisible(next);
    saveTrainingHitboxesVisible(next);
  }, []);
  const handleSpeedOverridesChange = useCallback((next: SpeedOverrides): void => {
    setTrainingSpeedOverrides(next);
    saveTrainingSpeedOverrides(next);
  }, []);
  const handleSpeedOverridesReset = useCallback((): void => {
    setTrainingSpeedOverrides(null);
    saveTrainingSpeedOverrides(null);
  }, []);
  const handleStartTraining = useCallback(async (): Promise<TrainingStateResponse | null> => {
    if (!canStartTraining) return null;
    return start(selectedPeriod);
  }, [canStartTraining, selectedPeriod, start]);
  const submitTrainingShotAndRefreshDaily = useCallback(
    async (args: Parameters<typeof submitShot>[0]) => {
      const result = await submitShot(args);
      if (result !== null) void refreshDaily();
      return result;
    },
    [refreshDaily, submitShot],
  );

  useEffect(() => {
    if (data?.state !== 'closed' && !isTrainingLockedByDaily) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [data?.state, isTrainingLockedByDaily]);

  if (!data) return null;

  const isTrainingActive = data.state === 'active';
  const isTrainingClosed = data.state === 'closed';
  const isTrainingPlayable = isTrainingActive && !isTrainingLockedByDaily;
  const nextDayAt = new Date(data.next_day_starts_at).getTime();
  const nextDayRemaining = Math.max(0, nextDayAt - now);
  const dailyPeriodEndsAt = dailyData?.period_ends_at
    ? new Date(dailyData.period_ends_at).getTime()
    : 0;
  const dailyBreakEndsAt = dailyData?.break_ends_at
    ? new Date(dailyData.break_ends_at).getTime()
    : 0;
  const dailyLockRemaining =
    dailyData?.state === 'period_active' && dailyPeriodEndsAt > 0
      ? Math.max(0, dailyPeriodEndsAt - now)
      : dailyData?.state === 'break_active' && dailyBreakEndsAt > 0
        ? Math.max(0, dailyBreakEndsAt - now)
        : 0;
  const trainingTimer = isTrainingLockedByDaily
    ? dailyLockRemaining > 0
      ? formatMs(dailyLockRemaining)
      : 'ИГРА'
    : isTrainingClosed
      ? formatHms(nextDayRemaining)
      : String(data.shots_limit);
  const trainingTimerLabel = isTrainingLockedByDaily
    ? dailyLockRemaining > 0
      ? 'ДО ИГРЫ'
      : 'СТАТУС'
    : isTrainingClosed
      ? 'ДО ОБНОВЛЕНИЯ'
      : 'ЛИМИТ';
  return (
    <>
      <PlayView<TrainingStateResponse>
        suppressedByModal={!isTrainingPlayable}
        showIceCar={isTrainingClosed || isTrainingLockedByDaily}
        playEntranceOnMount={isTrainingPlayable ? playEntranceOnMount : false}
        onEntranceConsumed={onEntranceConsumed}
        playRouteTransitionOnMount={playRouteTransitionOnMount}
        onRouteTransitionConsumed={onRouteTransitionConsumed}
        onBack={onBack}
        active={isTrainingPlayable}
        seed={data.training_seed}
        goalieId={data.goalie_id}
        periodNumber={data.selected_period ?? selectedPeriod}
        scoreboardPeriodsTotal={1}
        periodSpeedPresets={data.period_speed_presets}
        speedOverrides={trainingSpeedOverrides ?? undefined}
        sessionStartedAt={data.started_at}
        serverNow={data.server_now}
        receivedAtPerformanceMs={data.received_at_performance_ms}
        goals={data.goals}
        shots={data.shots_taken}
        shotsTotal={data.shots_limit}
        timer={trainingTimer}
        timerLabel={trainingTimerLabel}
        scoreboardNotice={isTrainingLockedByDaily ? 'Игра уже начата' : undefined}
        shotButtonLabel={
          isTrainingPlayable
            ? undefined
            : canStartTraining
              ? 'НАЧАТЬ'
              : isTrainingLockedByDaily
                ? 'ЛЁД ГОТОВИТСЯ'
                : 'ТРЕНИРОВКА ЗАВЕРШЕНА'
        }
        inactiveAction={canStartTraining ? handleStartTraining : undefined}
        entranceBeforeInactiveAction={true}
        backLabel="К тренировке"
        optimisticAddShot={optimisticAddShot}
        submitShot={submitTrainingShotAndRefreshDaily}
        applyState={applyState}
        hitboxesVisible={hitboxesVisible}
        playerOptions={TRAINING_STREET_PLAYER_OPTIONS}
        goalieOptions={TRAINING_AMATEUR_GOALIE_OPTIONS}
        overlayControls={
          canShowTrainingDebugControls ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <TrainingHitboxesToggle checked={hitboxesVisible} onChange={handleHitboxesChange} />
              <TrainingSpeedControls
                value={effectiveTrainingSpeeds}
                defaults={trainingDefaultSpeeds}
                open={speedControlsOpen}
                onOpen={() => setSpeedControlsOpen(true)}
                onClose={() => setSpeedControlsOpen(false)}
                onChange={handleSpeedOverridesChange}
                onReset={handleSpeedOverridesReset}
              />
            </div>
          ) : undefined
        }
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
