import { useOwnProfileSummary } from '../profile/useOwnProfileSummary.js';
import { useAmateurAccess } from "../amateur/useAmateurAccess.js";
import { prioritizeGameEntries } from "./gameNotifications.js";
import { FloatingGamePanel } from "./FloatingGamePanel.js";
import { isOpenRinkRoute } from "../components/BottomNav.js";
import { CurrencyAmount, PurchaseAction } from "../shop/PurchaseAction.js";
import { gameDockStatus, type GameDockStatus } from "./gameDockStatus.js";
import { CityGamePanel } from "./CityGamePanel.js";
import { isActionableDuelEvent } from "../components/useNavigationActivity.js";
import { duelFormatLabel, duelScorePairText } from "../components/duel/scoredDuel.js";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { type DuelPlayerCondition } from "@hockey/game-core";
import { formatMs } from "../game/formatTime.js";
import { useAuthStore } from "../auth/authStore.js";
import { useDailyStore } from "../stores/dailyStore.js";
import { fetchActiveClassicTournamentGames, type ActiveTournamentGame } from "../api/tournamentClassic.js";
import { useTrainingSessionStore } from "../stores/trainingSessionStore.js";
import { UserAvatar } from "../chat/components/UserAvatar.js";
import { AccessibleModal } from "../components/AccessibleModal.js";
import type { TrainingStateResponse } from "../api/training.js";
import { arenaCourtImage, arenaVideoCubeClass, arenaVideoCubeImage } from "../screens/lockerRoomBackground.js";
import { ordinaryDuelLockCopy } from "../api/gameplayLock.js";
import { useGameplayLockRefresh } from "../hooks/useGameplayLockRefresh.js";
import { amateurAccessDetailsFromError, guardAmateurMutation } from "../amateur/amateurAccess.js";
import { dailyGameplayLockCopy, gameplayLockCopy, tournamentGameDateCopy } from "../api/gameplayLock.js";
import { fetchMyInventory, useRecoveryKit, type InventoryItem, type InventoryState } from "../api/inventory.js";
import { acceptAmateurDuel, declineAmateurDuel, fetchAmateurEvents, type AmateurDuelMatch, type AmateurDuelMatchState, type AmateurDuelPeriodRule } from "../api/amateurDuel.js";
import { DuelEquipmentSelectionRadio } from "../components/duel/DuelLockerTab.js";
import { openTournamentFixtureSegment } from "../api/tournament.js";
import { venueRoleLabel, type VenueRole } from "../components/VenueBadge.js";
import { artworkForInventoryItem, placeholderArtworkForKind } from "../screens/inventoryArtwork.js";
import { formatInventoryResourceAmount } from "../screens/inventoryResourceLabels.js";

export const HUB_PERIOD_DURATION_MS = 20 * 60 * 1000;

export type ModeInfoModalContent = { title: string; text: string };

export type ArenaEntryKind = 'daily' | 'training' | 'duel' | 'classic' | 'bar';

export interface ArenaEntry {
  matchId?: string | null;
  dockTimer?:string;
  inProgress?: boolean;
  dockState?: 'ready'|'active'|'break'|'done'|'blocked';
  attention?: boolean;
  deadlineAt?: number | undefined;
  id: string;
  kind: ArenaEntryKind;
  eyebrow: string;
  eyebrowStatus?: string;
  title: string;
  subtitle: string;
  subtitleLines?: [string, string];
  compactTitle?: boolean;
  compactSubtitle?: boolean;
  meta: string;
  ctaLabel: string;
  disabled?: boolean;
  scoreboard?: JSX.Element | null;
  opponentName?: string;
  opponentAvatarUrl?: string | null;
  typeLabel?: string;
  venueRole?: VenueRole;
  secondaryActions?: ReactNode;
  onEnter: () => void;
}

export const DUEL_INTERMISSION_CONTINUE_GRACE_MS = 5 * 60 * 1000;

export const ARENA_SELECTED_ENTRY_STORAGE_KEY = 'hockey.arenaSelectedEntryId';

export function trainingProgressLabel(data: TrainingStateResponse | null): string {
  if (!data) return 'Загрузка тренировки…';
  return `${data.shots_taken}/${data.shots_limit} бросков сегодня`;
}

export function readArenaSelectedEntryId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(ARENA_SELECTED_ENTRY_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveArenaSelectedEntryId(value: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.localStorage.setItem(ARENA_SELECTED_ENTRY_STORAGE_KEY, value);
    else window.localStorage.removeItem(ARENA_SELECTED_ENTRY_STORAGE_KEY);
  } catch {
    // The arena selection is just a UI convenience; storage failure should not block navigation.
  }
}

export function formatHms(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function formatEventRemaining(ms: number): string {
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

export function formatDurationMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export type PlayOpenOptions = {
  entrance?: boolean;
  directPlay?: boolean;
  routeTransition?: boolean;
};

export function playoffArenaStageLabel(game: Extract<ActiveTournamentGame, { kind: 'playoff' }>): string {
  if (game.round_stage === 'third_place') return 'Матч за 3-е место';
  const distance = game.final_round_number - game.round_number;
  if (distance === 0) return 'Финал';
  if (distance === 1) return 'Полуфинал';
  if (distance === 2) return 'Четвертьфинал';
  if (distance === 3) return '1/8 финала';
  if (distance === 4) return '1/16 финала';
  return `${game.round_number}-й раунд`;
}

export function GameHub({
  presentation = 'arena',
  extraEntries = [],
  onDockStatusChange,
  openRequest=0,
  onOpenDailyPlay,
  onOpenTraining,
  onOpenTrainingPlay,
  onOpenAmateurMatch,
}: {
  presentation?: 'arena'|'city'|'floating';
  extraEntries?: ArenaEntry[];
  onDockStatusChange?:(status:GameDockStatus)=>void;
  openRequest?:number;
  onOpenDailyPlay: (options?: PlayOpenOptions) => void;
  onOpenTraining: () => void;
  onOpenTrainingPlay: (options?: PlayOpenOptions) => void;
  onOpenAmateurMatch: (matchId: string, options?: PlayOpenOptions) => void;
}): JSX.Element {
  const navigate = useNavigate();
  const hubLocation=useLocation();
  const backgroundGameplay=presentation==='floating'&&(isOpenRinkRoute(hubLocation)||hubLocation.pathname.startsWith('/duel/'));
  const queryClient = useQueryClient();
  const profileQuery = useOwnProfileSummary();
  const data = useDailyStore((s) => s.data)!;
  const panelOwner = useAuthStore((s)=>s.user?.id??'anonymous');
  const amateurAccess = useAmateurAccess();
  const refresh = useDailyStore((s) => s.refresh);
  const trainingData = useTrainingSessionStore((s) => s.data);
  const trainingInFlight = useTrainingSessionStore((s) => s.inFlight);
  const refreshTraining = useTrainingSessionStore((s) => s.refresh);
  const [modeInfoModal, setModeInfoModal] = useState<ModeInfoModalContent | null>(null);
  const [duelStatsMatch, setDuelStatsMatch] = useState<AmateurDuelMatch | null>(null);
  const [recoveryTarget, setRecoveryTarget] = useState<{
    action: 'start_daily_period' | 'start_classic';
    tournamentId?: string;
  } | null>(null);
  const [arenaActionId, setArenaActionId] = useState<string | null>(null);
  const pending = useDailyStore((s) => s.inFlight);
  const nextPeriod = data.current_period === 0 ? 1 : data.current_period + 1;
  const dailyAvailableTitle = `${nextPeriod}-й период доступен`;
  const breakEndsAt = data.break_ends_at ? new Date(data.break_ends_at).getTime() : 0;
  const periodEndsAt = data.period_ends_at ? new Date(data.period_ends_at).getTime() : 0;
  const nextDayAt = new Date(data.next_day_starts_at).getTime();
  const trainingCooldownEndsAt = data.gameplay_lock?.ends_at
    ? new Date(data.gameplay_lock.ends_at).getTime()
    : 0;
  const [now, setNow] = useState(Date.now());
  const breakRemaining = Math.max(0, breakEndsAt - now);
  const periodRemaining = Math.max(0, periodEndsAt - now);
  const nextDayRemaining = Math.max(0, nextDayAt - now);
  const trainingCooldownRemaining = Math.max(0, trainingCooldownEndsAt - now);
  const isTrainingLockedByDaily =
    trainingData?.gameplay_lock?.reason === 'recent_gameplay' ||
    trainingData?.gameplay_lock?.reason === 'active_daily';
  const isTrainingLockedByTournament =
    trainingData?.gameplay_lock?.blocked === true && !isTrainingLockedByDaily;
  const isDailyLockedByTraining = data.state === 'idle' && data.gameplay_lock?.blocked === true;
  useGameplayLockRefresh(presentation==='floating'?null:data.gameplay_lock);
  useGameplayLockRefresh(presentation==='floating'?null:trainingData?.gameplay_lock);
  const amateurEvents = useQuery({
    queryKey: ['amateur-duel', 'events'],
    queryFn: fetchAmateurEvents,
    enabled: amateurAccess.hasFullAccess,
    refetchInterval: presentation==='city'?false:30_000,
    refetchOnMount: presentation==='city'?false:true,
  });
  const classicTournamentGames = useQuery({
    queryKey: ['tournaments', 'classic', 'active'],
    queryFn: fetchActiveClassicTournamentGames,
    refetchInterval: presentation==='city'?false:30_000,
    refetchOnMount: presentation==='city'?false:true,
  });
  const amateurEventItems = amateurEvents.data?.events ?? [];
  const duelStatsCurrentMatch = duelStatsMatch
    ? (amateurEventItems.find((event) => event.id === duelStatsMatch.id) ?? duelStatsMatch)
    : null;
  const activeDuelEvents = amateurEventItems.filter(
    (event) => event.source !== 'tournament' && isArenaDuelEvent(event),
  );
  const [activeCubeEntryId, setActiveCubeEntryId] = useState<string | null>(
    readArenaSelectedEntryId,
  );
  const prioritizedEventEntryIdsRef = useRef<string | null>(null);

  useEffect(() => {
    const state=useTrainingSessionStore.getState();
    if(presentation!=='floating'||(!state.data&&!state.loading&&!state.inFlight))void refreshTraining();
  }, [refreshTraining,presentation]);

  useEffect(() => {
    if (
      presentation !== 'city' &&
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
    presentation,
    activeDuelEvents.length,
    classicTournamentGames.data?.games?.length,
    data.state,
    isDailyLockedByTraining,
  ]);

  useEffect(() => {
    if(backgroundGameplay)return;
    if (data.state === 'period_active' && periodEndsAt > 0 && periodRemaining === 0) void refresh();
    if (data.state === 'break_active' && breakEndsAt > 0 && breakRemaining === 0) void refresh();
    if (data.state === 'closed' && nextDayAt > 0 && nextDayRemaining === 0) void refresh();
    if (isDailyLockedByTraining && trainingCooldownEndsAt > 0 && trainingCooldownRemaining === 0) {
      void refresh();
    }
  }, [
    backgroundGameplay,
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
  const dailyActionLabel =
    isDailyLockedByTraining && data.gameplay_lock?.reason === 'recent_gameplay'
      ? 'Сократить восстановление'
      : 'На лёд';
  const dailyEventTitle = isDailyLockedByTraining
    ? data.gameplay_lock?.reason === 'recent_gameplay'
      ? 'Восстановление'
      : 'Турнирная игра'
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
                timerLabel:
                  data.gameplay_lock?.reason === 'scheduled_tournament'
                    ? 'Дата игры'
                    : trainingCooldownEndsAt > 0
                      ? 'До игры'
                      : 'Статус',
                timer:
                  data.gameplay_lock?.reason === 'scheduled_tournament'
                    ? (tournamentGameDateCopy(data.gameplay_lock) ?? 'ИГРА')
                    : trainingCooldownEndsAt > 0
                      ? formatHms(trainingCooldownRemaining)
                      : 'ИГРА',
                activePeriod: null,
                ariaLabel: `${dailyGameplayLockCopy(data.gameplay_lock!, now)}${trainingCooldownEndsAt > 0 ? `. До игры ${formatHms(trainingCooldownRemaining)}` : ''}`,
              }
            : {
                timerLabel: 'Время',
                timer: formatMs(HUB_PERIOD_DURATION_MS),
                activePeriod: nextPeriod,
                ariaLabel: `${dailyAvailableTitle}. Время периода ${formatMs(HUB_PERIOD_DURATION_MS)}. Период ${nextPeriod}`,
              };
  const trainingAvailability = trainingData?.gameplay_lock?.blocked
    ? gameplayLockCopy(trainingData.gameplay_lock, now)
    : trainingProgressLabel(trainingData);

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
    if (isDailyLockedByTraining && data.gameplay_lock?.reason === 'recent_gameplay') {
      setRecoveryTarget({ action: 'start_daily_period' });
      return;
    }
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
      isTrainingLockedByTournament ||
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
      if (amateurAccessDetailsFromError(err) === null) {
        setModeInfoModal({
          title: 'Не удалось принять дуэль',
          text: err instanceof Error ? err.message : 'Попробуйте ещё раз.',
        });
      }
      void queryClient.invalidateQueries({ queryKey: ['amateur-duel'] });
    },
  });

  const declineArenaDuelMut = useMutation({
    mutationFn: (matchId: string) => declineAmateurDuel(matchId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['amateur-duel'] });
    },
    onError: (err) => {
      if (amateurAccessDetailsFromError(err) === null) {
        setModeInfoModal({
          title: 'Не удалось отклонить дуэль',
          text: err instanceof Error ? err.message : 'Попробуйте ещё раз.',
        });
      }
      void queryClient.invalidateQueries({ queryKey: ['amateur-duel'] });
    },
  });

  const openArenaTournamentGame = useMutation({
    mutationFn: async (game: Extract<ActiveTournamentGame, { kind: 'playoff' }>) => ({
      game,
      duelMatchId:
        game.duel_match_id ??
        (await openTournamentFixtureSegment(game.tournament_id, game.fixture_id)).duelMatchId,
    }),
    onSuccess: ({ game, duelMatchId }) => {
      const params = new URLSearchParams({
        view: 'amateur',
        section: 'tournaments',
        tournament: game.tournament_id,
        tab: 'schedule',
        fixture: game.fixture_id,
        match: duelMatchId,
        play: '1',
      });
      navigate(`/?${params.toString()}`, { replace: true });
    },
    onError: (err) => {
      if (amateurAccessDetailsFromError(err) === null) {
        setModeInfoModal({
          title: 'Не удалось открыть игру',
          text: err instanceof Error ? err.message : 'Попробуйте ещё раз.',
        });
      }
      void queryClient.invalidateQueries({ queryKey: ['tournaments', 'classic', 'active'] });
    },
  });

  const dailyArenaEntry: ArenaEntry = {
    id: 'daily',
    dockTimer: isDailyInProgress?dailyHubScoreboard.timer:formatHms(nextDayRemaining),
    dockState: data.state==='closed'?'done':isDailyLockedByTraining?'blocked':data.state==='period_active'?'active':data.state==='break_active'?'break':'ready',
    kind: 'daily',
    eyebrow: 'Ежедневная игра',
    title: dailyEventTitle,
    compactTitle: isDailyLockedByTraining,
    compactSubtitle: isDailyLockedByTraining,
    subtitle:
      data.state === 'closed'
        ? 'День завершён, следующий старт после обновления.'
        : isDailyLockedByTraining
          ? dailyGameplayLockCopy(data.gameplay_lock!, now)
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
        timerOnly={data.state === 'closed' || isDailyLockedByTraining}
      />
    ),
  };
  const trainingArenaEntry: ArenaEntry = {
    id: 'training',
    dockTimer: trainingData?formatHms(Math.max(0,timestampMs(trainingData.next_day_starts_at)-now)):'',
    dockState: trainingData?.state==='closed'?'done':!trainingData||trainingData.gameplay_lock?.blocked?'blocked':trainingData.state==='active'?'active':'ready',
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
    const eventLock =
      event.source !== 'tournament' && event.duel_lock?.blocked ? event.duel_lock : null;
    const timing = duelEventTiming(event, now);
    const isIncomingInvite = isDuelInviteForMe(event);
    const invitePending =
      (acceptArenaDuelMut.isPending && acceptArenaDuelMut.variables === event.id) ||
      (declineArenaDuelMut.isPending && declineArenaDuelMut.variables === event.id);
    return {
      id: `duel-${event.id}`,
      inProgress: event.status === 'active',
      attention: isActionableDuelEvent(event),
      dockState: event.me.state==='period_active'?'active':event.me.state==='break_active'?'break':isActionableDuelEvent(event)?'ready':'blocked',
      deadlineAt: timestampMs(event.status==='ready_check'||event.status==='invited'?event.ready_expires_at:timestampMs(event.starts_at)>now?event.starts_at:event.me.state==='period_active'?event.period_ends_at:event.me.state==='break_active'?event.break_ends_at:event.ends_at)||undefined,
      kind: 'duel',
      eyebrow: 'Активная дуэль',
      eyebrowStatus: duelOutcomeText(event),
      title: event.opponent.display_name,
      subtitle: eventLock ? ordinaryDuelLockCopy(eventLock) : '',
      meta: eventLock ? '' : `${timing.label}: ${timing.value}`,
      ctaLabel: arenaDuelCtaLabel(event, now),
      disabled:
        (event.source !== 'tournament' && event.duel_lock?.blocked === true) ||
        isIncomingInvite ||
        arenaActionId === `duel-${event.id}` ||
        isArenaLaunching ||
        invitePending,
      opponentName: event.opponent.display_name,
      opponentAvatarUrl: event.opponent.avatar_url,
      typeLabel: duelFormatLabel(event.rules),
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
            className="btn arena-duel-invite-action arena-duel-invite-action--decline"
            disabled={invitePending}
            onClick={() =>
              guardAmateurMutation(amateurAccess, () => declineArenaDuelMut.mutate(event.id))
            }
            style={{ minHeight: 34, fontSize: 'clamp(10px, 1.45vh, 12px)', padding: '0 10px' }}
          >
            Отклонить
          </button>
          <button
            type="button"
            className="btn arena-duel-invite-action arena-duel-invite-action--accept"
            disabled={
              invitePending || (event.source !== 'tournament' && event.duel_lock?.blocked === true)
            }
            onClick={() =>
              guardAmateurMutation(amateurAccess, () => acceptArenaDuelMut.mutate(event.id))
            }
            style={{ minHeight: 34, fontSize: 'clamp(10px, 1.45vh, 12px)', padding: '0 10px' }}
          >
            Принять
          </button>
        </div>
      ) : undefined,
      onEnter: () => void handleOpenDuel(event),
      scoreboard: eventLock ? null : (
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
      const priority = (game: ActiveTournamentGame): number => {
        if (game.kind === 'playoff') {
          return game.state === 'active' || game.state === 'ready_check' ? 0 : 1;
        }
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
      if (game.kind === 'playoff') {
        const breakRemaining = Math.max(0, timestampMs(game.break_ends_at) - now);
        const startsAtRemaining = Math.max(0, timestampMs(game.starts_at) - now);
        const readinessRemaining = Math.max(0, timestampMs(game.readiness_ends_at) - now);
        const closesAtRemaining = Math.max(0, timestampMs(game.closes_at) - now);
        const isBreak = game.state === 'inter_game_break' && game.break_ends_at !== null;
        const isPaused = game.state === 'paused';
        const isReady = game.state === 'ready_check' && readinessRemaining > 0;
        const isExpiredReadyCheck = game.state === 'ready_check' && readinessRemaining === 0;
        const isActive = game.state === 'active';
        const waitingForOpponent = (isReady && game.my_ready === true) || (isActive && game.my_completed === true);
        const canEnterGame = isReady || isActive;
        return {
          id: `playoff-${game.tournament_id}-${game.tournament_day}`,
          matchId: game.duel_match_id,
          inProgress: isActive || isBreak || isPaused,
          attention: !waitingForOpponent && !isPaused && !isExpiredReadyCheck,
          dockState: waitingForOpponent||isPaused||isExpiredReadyCheck?'blocked':isBreak?'break':isActive?'active':isReady?'ready':'blocked',
          deadlineAt: timestampMs(isReady?game.readiness_ends_at:isBreak?game.break_ends_at:isActive?game.closes_at:game.starts_at),
          kind: 'duel',
          eyebrow: `Турнир · ${playoffArenaStageLabel(game)}`,
          title: game.tournament_title,
          subtitle: waitingForOpponent
            ? 'Ждём соперника'
            : isPaused
            ? 'Игра ожидает решения администратора.'
            : isBreak
              ? 'Перерыв между играми серии'
              : isReady
                ? 'Игра серии ожидает подтверждения.'
                : isActive
                  ? 'Игра серии уже началась.'
                  : isExpiredReadyCheck
                    ? 'Время подтверждения истекло.'
                    : 'Игра серии ожидает готовности.',
          meta: isActive && game.my_completed === true
            ? 'Вы завершили свою игру'
            : isBreak
            ? `Следующая игра через ${formatMs(breakRemaining)}`
            : isPaused
              ? 'Расписание ожидает решения'
              : isReady
                ? `Подтвердите участие за ${formatMs(readinessRemaining)}`
                : isActive
                  ? `До конца игры ${formatMs(closesAtRemaining)}`
                  : isExpiredReadyCheck
                    ? 'Ожидаем результат проверки готовности'
                    : `Старт через ${formatEventRemaining(startsAtRemaining)}`,
          ctaLabel: canEnterGame ? 'На лёд' : 'К расписанию',
          disabled: canEnterGame && openArenaTournamentGame.isPending,
          onEnter: () => {
            if (canEnterGame) {
              if (game.duel_match_id !== null) {
                openArenaTournamentGame.mutate(game);
              } else {
                guardAmateurMutation(amateurAccess, () => openArenaTournamentGame.mutate(game));
              }
              return;
            }
            navigate(
              `/?view=amateur&section=tournaments&tournament=${encodeURIComponent(game.tournament_id)}&tab=schedule`,
              { replace: true },
            );
          },
          scoreboard: (
            <DailyHubScoreboard
              activePeriod={0}
              ariaLabel={
                isActive && game.my_completed === true
                  ? `${game.tournament_title}. Вы завершили свою игру. Ждём соперника.`
                  : isPaused
                  ? `${game.tournament_title}. Игра ожидает решения администратора.`
                  : isBreak
                    ? `${game.tournament_title}. Перерыв между играми серии. До конца ${formatMs(breakRemaining)}`
                    : isReady
                      ? `${game.tournament_title}. До подтверждения ${formatMs(readinessRemaining)}`
                      : isActive
                        ? `${game.tournament_title}. Игра идёт. До конца ${formatMs(closesAtRemaining)}`
                        : isExpiredReadyCheck
                          ? `${game.tournament_title}. Время подтверждения истекло.`
                          : `${game.tournament_title}. Старт через ${formatEventRemaining(startsAtRemaining)}`
              }
              periodsTotal={game.total_periods}
              timer={
                isActive && game.my_completed === true
                  ? '—'
                  : isPaused
                  ? '—'
                  : isBreak
                    ? formatMs(breakRemaining)
                    : isReady
                      ? formatMs(readinessRemaining)
                      : isActive
                        ? formatMs(closesAtRemaining)
                        : isExpiredReadyCheck
                          ? '—'
                          : formatEventRemaining(startsAtRemaining)
              }
              timerLabel={
                isActive && game.my_completed === true
                  ? 'Ожидание'
                  : isPaused
                  ? 'Пауза'
                  : isBreak
                    ? 'Перерыв'
                    : isReady
                      ? 'До подтверждения'
                      : isActive
                        ? 'До конца'
                        : isExpiredReadyCheck
                          ? 'Проверка'
                          : 'До старта'
              }
            />
          ),
        };
      }
      const deadlineRemaining = Math.max(0, timestampMs(game.closes_at) - now);
      const breakRemaining = Math.max(0, timestampMs(game.break_ends_at) - now);
      const isBreak = game.state === 'break_active' && game.break_ends_at !== null;
      const started =
        game.state === 'period_active' ||
        game.state === 'break_active' ||
        (game.state === 'idle' && game.current_period > 0);
      const completed = game.state === 'closed';
      const gameplayLock = !started && !completed ? game.gameplay_lock : null;
      const locked = gameplayLock?.blocked === true;
      const lockedByRecovery = locked && gameplayLock.reason === 'recent_gameplay';
      const recoveryRemaining = gameplayLock?.ends_at
        ? Math.max(0, timestampMs(gameplayLock.ends_at) - now)
        : 0;
      return {
        id: `classic-${game.tournament_id}`,
        inProgress: started && !completed,
        attention: !completed,
        dockState: completed?'done':locked?'blocked':isBreak?'break':game.state==='period_active'?'active':'ready',
        deadlineAt: timestampMs(isBreak?game.break_ends_at:game.closes_at),
        kind: 'classic',
        eyebrow: `Турнир · ${game.tournament_day}-й тур`,
        title: game.tournament_title,
        subtitle: locked
          ? gameplayLockCopy(gameplayLock, now)
          : completed
            ? 'Игра завершена, результат сохранён.'
            : started
              ? 'Турнирная игра уже начата.'
              : 'Отдельная игра по правилам турнира',
        ...(!completed && !started && !locked
          ? { subtitleLines: ['Отдельная игра', 'по правилам турнира'] as [string, string] }
          : {}),
        meta: locked
          ? 'Турнирная игра временно недоступна.'
          : completed
            ? ''
            : `${game.current_period > 0 ? `${game.current_period}-й период` : 'Три периода'} · до ${formatEventRemaining(deadlineRemaining)}`,
        ctaLabel: lockedByRecovery
          ? 'Сократить восстановление'
          : locked
            ? 'Лёд готовится'
            : started
              ? 'Продолжить'
              : 'Начать',
        disabled: completed || (locked && !lockedByRecovery),
        onEnter: () => {
          if (lockedByRecovery) {
            setRecoveryTarget({ action: 'start_classic', tournamentId: game.tournament_id });
            return;
          }
          if (locked) return;
          navigate(`/?view=classic&tournament=${encodeURIComponent(game.tournament_id)}`, {
            replace: true,
          });
        },
        ...(locked
          ? {
              scoreboard: (
                <DailyHubScoreboard
                  activePeriod={null}
                  ariaLabel={`${gameplayLockCopy(gameplayLock, now)}. До игры ${formatHms(recoveryRemaining)}`}
                  periodsTotal={3}
                  timer={gameplayLock.ends_at ? formatHms(recoveryRemaining) : 'ИГРА'}
                  timerLabel={gameplayLock.ends_at ? 'До игры' : 'Статус'}
                  timerOnly
                />
              ),
            }
          : completed
            ? {
                scoreboard: (
                  <DailyHubScoreboard
                    activePeriod={null}
                    ariaLabel={`Завершена. До обновления ${formatHms(deadlineRemaining)}`}
                    periodsTotal={3}
                    timer={formatHms(deadlineRemaining)}
                    timerLabel="До обновления"
                    timerOnly
                  />
                ),
              }
            : {
                scoreboard: (
                  <DailyHubScoreboard
                    activePeriod={
                      game.state === 'period_active'
                        ? game.current_period
                        : Math.min(3, game.current_period + 1)
                    }
                    ariaLabel={
                      isBreak
                        ? `${game.tournament_title}. ${game.tournament_day}-й тур. Перерыв. До конца ${formatMs(breakRemaining)}. Период ${Math.min(3, game.current_period + 1)}`
                        : `${game.tournament_title}. ${game.tournament_day}-й тур. До конца дня ${formatEventRemaining(deadlineRemaining)}`
                    }
                    periodsTotal={3}
                    spacious
                    timer={
                      isBreak ? formatMs(breakRemaining) : formatEventRemaining(deadlineRemaining)
                    }
                    timerLabel={isBreak ? 'Перерыв' : 'До конца дня'}
                  />
                ),
              }),
      };
    });
  const arenaEntries: ArenaEntry[] = prioritizeGameEntries([
    ...duelArenaEntries,
    ...classicArenaEntries,
    ...extraEntries,
    dailyArenaEntry,
    trainingArenaEntry,
  ]);
  const dockStatus=gameDockStatus(arenaEntries);
  useEffect(()=>{onDockStatusChange?.({label:dockStatus.label,urgent:dockStatus.urgent});},[onDockStatusChange,dockStatus.label,dockStatus.urgent]);
  const pendingEventEntryIds = arenaEntries.filter(entry=>(entry.kind==='duel'||entry.kind==='classic'||entry.kind==='bar')&&entry.dockState!=='done').map(entry=>entry.id).join('|');
  const firstPendingEventEntryId = arenaEntries.find(entry=>(entry.kind==='duel'||entry.kind==='classic'||entry.kind==='bar')&&entry.dockState!=='done')?.id ?? null;

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
    if (firstPendingEventEntryId === null) {
      prioritizedEventEntryIdsRef.current = null;
      return;
    }
    if (prioritizedEventEntryIdsRef.current === pendingEventEntryIds) return;
    prioritizedEventEntryIdsRef.current = pendingEventEntryIds;
    if (activeCubeEntryId === firstPendingEventEntryId) return;
    setActiveCubeEntryId(firstPendingEventEntryId);
    saveArenaSelectedEntryId(firstPendingEventEntryId);
  }, [activeCubeEntryId, pendingEventEntryIds, firstPendingEventEntryId]);

  const handleArenaActiveIndexChange = useCallback(
    (index: number): void => {
      const entry = arenaEntries[index];
      if (!entry || entry.id === activeCubeEntryId) return;
      setActiveCubeEntryId(entry.id);
      saveArenaSelectedEntryId(entry.id);
    },
    [activeCubeEntryId, arenaEntries],
  );

  const Container=presentation==='arena'?'main':'div';
  return (
    <Container className={presentation==='arena'?'screen':undefined} style={presentation==='arena'?{position:'fixed',inset:0,width:'100%',height:'100dvh',padding:0,overflow:'hidden',background:'#06111d'}:{display:'contents'}}>
      {presentation==='floating'?<FloatingGamePanel owner={panelOwner} entries={arenaEntries} activeIndex={activeCubeIndex} onActiveIndexChange={handleArenaActiveIndexChange} renderFace={entry=><ArenaCubeFace entry={entry}/>} renderActions={entry=><ArenaCubeActions entry={entry}/>}/>:presentation==='city'?<CityGamePanel key={panelOwner} storageKey={`city-game-panel-expanded-v1:${panelOwner}`} openRequest={openRequest} entries={arenaEntries} activeIndex={activeCubeIndex} onActiveIndexChange={handleArenaActiveIndexChange} renderFace={entry=><ArenaCubeFace entry={entry}/>} renderActions={entry=><ArenaCubeActions entry={entry}/>}/>:<>
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
          cubeImage={arenaVideoCubeImage(profileQuery.data?.competitionLevel)}
          cubeClass={arenaVideoCubeClass(profileQuery.data?.competitionLevel)}
          backgroundImage={arenaCourtImage(profileQuery.data?.competitionLevel)}
        />
      </section>
      </>}

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
      {recoveryTarget && (
        <RecoveryKitModal
          action={recoveryTarget.action}
          onApplied={async () => {
            await refresh();
            await queryClient.invalidateQueries({
              queryKey: ['tournaments', 'classic', 'active'],
            });
            if (recoveryTarget.tournamentId !== undefined) {
              await queryClient.refetchQueries({
                queryKey: ['tournaments', 'classic', 'active'],
              });
            }
          }}
          onClose={() => setRecoveryTarget(null)}
        />
      )}
    </Container>
  );
}

export function ArenaVideoCube({
  entries,
  activeIndex,
  onActiveIndexChange,
  cubeImage,
  cubeClass,
  backgroundImage,
}: {
  entries: ArenaEntry[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  cubeImage: string;
  cubeClass: string;
  backgroundImage: string;
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
        src={backgroundImage}
        alt=""
        aria-hidden="true"
      />
      <div className={`arena-video-cube__plate ${cubeClass}`}>
        <img className="arena-video-cube__cube" src={cubeImage} alt="" aria-hidden="true" />
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
                    background: active ? 'var(--liquid-selected-bg)' : 'var(--liquid-inset-bg)' ,
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
          <ArenaCubeActions entry={activeEntry}/>
        </div>
      </div>
    </div>
  );
}

export function ArenaCubeActions({entry}:{entry:ArenaEntry}):JSX.Element{
 return <>{entry.secondaryActions !== undefined ? (
            entry.secondaryActions
          ) : entry.disabled ? null : (
            <button
              type="button"
              className="btn btn--cta"
              disabled={entry.disabled}
              onClick={entry.onEnter}
              style={{
                position: 'relative',
                zIndex: 3,
                width: 'min(160px, 70%)',
                minWidth: 0,
                minHeight: 'clamp(36px, 4.8vh, 44px)',
                margin: '0 auto',
                padding: '0 16px',
                boxSizing: 'border-box',
                justifyContent: 'center',
                fontSize:
                  entry.ctaLabel === 'Сократить восстановление'
                    ? 'clamp(11px, 1.4vh, 12px)'
                    : 'clamp(12px, 1.65vh, 14px)',
                fontWeight: entry.ctaLabel === 'Сократить восстановление' ? 700 : 900,
                letterSpacing: '0.06em',
                lineHeight: 1,
                background: 'var(--liquid-inset-bg)',
                color: 'var(--liquid-ink)',
                border: '1px solid rgba(255, 255, 255, 0.78)',
                boxShadow:
                  '0 0 14px rgba(138, 221, 255, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.86)',
              }}
            >
              {entry.ctaLabel}
            </button>
          )}</>;
}

export function ArenaTableauNavButton({
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

export function ArenaCubeFace({ entry }: { entry: ArenaEntry }): JSX.Element {
  const showDuelIdentity = (entry.kind === 'duel' || entry.kind === 'bar') && Boolean(entry.opponentName);

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
        color: 'var(--arena-cube-ink, #e9fbff)',
        fontFamily: 'var(--font-mono)',
        textShadow: 'var(--arena-cube-text-shadow, 0 0 8px rgba(122, 229, 255, 0.36))',
      }}
    >
      <div
        style={{
          minHeight: 0,
          height: '100%',
          display: 'grid',
          gridAutoRows: 'auto',
          alignContent: 'space-evenly',
          justifyItems: 'center',
          gap: 'clamp(4px, 0.7vh, 6px)',
          textAlign: 'center',
          padding: 0,
        }}
      >
        <div style={{ display: 'grid', justifyItems: 'center', gap: 2 }}>
          <div
            style={{
              color: 'var(--arena-cube-label, rgba(205, 246, 255, 0.88))',
              fontSize: 'clamp(7px, 1.08vh, 9px)',
              fontWeight: 950,
              letterSpacing: showDuelIdentity ? '0.08em' : '0.16em',
              textTransform: 'uppercase',
              lineHeight: 1.05,
              textShadow: 'var(--arena-cube-text-shadow, 0 0 8px rgba(99, 218, 255, 0.44))',
            }}
          >
            {entry.eyebrow}
            {entry.eyebrowStatus ? ` (${entry.eyebrowStatus})` : ''}
          </div>
          {showDuelIdentity && entry.typeLabel && (
            <div
              className="arena-duel-format-heading"
              style={{
                color: 'rgba(247, 254, 255, 0.92)',
                marginTop: 3,
                textAlign: 'center',
                textShadow: 'var(--arena-cube-text-shadow, 0 0 9px rgba(144, 231, 255, 0.58))',
              }}
            >
              {entry.typeLabel}
            </div>
          )}
        </div>
        {showDuelIdentity ? (
          <div
            className="arena-duel-identity"
            style={{
              display: 'grid',
              gridTemplateColumns: 'clamp(38px, 6vh, 54px) minmax(0, 1fr)',
              alignItems: 'center',
              gap: 'clamp(5px, 1vh, 8px)',
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
                className="arena-duel-opponent-name"
                style={{
                  color: 'var(--arena-cube-ink, #f7feff)',
                  lineHeight: 0.95,
                  fontWeight: 950,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {entry.title}
              </div>
              {entry.venueRole && (
                <span
                  className="arena-duel-venue-label"
                  aria-label={`Площадка: ${venueRoleLabel(entry.venueRole)}`}
                >
                  {venueRoleLabel(entry.venueRole)}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div
            className={`arena-cube-title${entry.title.length > 28 ? ' arena-cube-title--long' : ''}${entry.compactTitle ? ' arena-cube-title--compact' : ''}`}
            style={{
              color: 'var(--arena-cube-ink, #f7feff)',
              fontSize: entry.compactTitle
                ? entry.title === 'Восстановление'
                  ? '19px'
                  : 'clamp(13px, 2vh, 17px)'
                : entry.title.length > 28
                  ? 'clamp(13px, 2.05vh, 17px)'
                  : 'clamp(16px, 2.65vh, 22px)',
              lineHeight: entry.compactTitle ? 1 : entry.title.length > 28 ? 1.02 : 0.95,
              fontWeight: 950,
              display: entry.compactTitle ? 'block' : '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: entry.compactTitle ? 1 : 3,
              overflow: 'hidden',
              overflowWrap: 'break-word',
              whiteSpace: entry.compactTitle ? 'nowrap' : undefined,
              textTransform: 'uppercase',
              maxWidth: '100%',
            }}
          >
            {entry.title}
          </div>
        )}
        {entry.subtitle&&<div
          className={entry.compactSubtitle ? 'arena-cube-subtitle--compact' : undefined}
          style={{
            maxWidth: entry.compactSubtitle ? 'min(84%, 300px)' : 'min(72%, 280px)',
            margin: '0 auto',
            color: 'var(--arena-cube-copy, rgba(234, 246, 255, 0.9))',
            fontSize: entry.compactSubtitle
              ? 'clamp(8px, 1.12vh, 9px)'
              : 'clamp(9px, 1.24vh, 10px)',
            fontWeight: 850,
            lineHeight: entry.compactSubtitle ? 1.08 : 1.12,
            textShadow: 'var(--arena-cube-text-shadow, 0 0 7px rgba(0, 12, 24, 0.88))',
          }}
        >
          {entry.subtitleLines ? (
            <span aria-label={entry.subtitle}>
              {entry.subtitleLines[0]}
              <br />
              {entry.subtitleLines[1]}
            </span>
          ) : (
            entry.subtitle
          )}
        </div>}
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
                color: 'var(--arena-cube-ink, #e9fbff)',
                fontSize: 'clamp(12px, 1.85vh, 16px)',
                fontWeight: 950,
                lineHeight: 1.05,
                textAlign: 'center',
                textShadow: 'var(--arena-cube-text-shadow, 0 0 8px rgba(100, 218, 255, 0.38))',
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

export function DailyHubScoreboard({
  activePeriod,
  align = 'center',
  ariaLabel,
  periodsTotal,
  timer,
  timerLabel,
  timerOnly = false,
  spacious = false,
}: {
  activePeriod: number | null;
  align?: 'center' | 'left';
  ariaLabel: string;
  periodsTotal: number;
  timer: string;
  timerLabel: string;
  timerOnly?: boolean;
  spacious?: boolean;
}): JSX.Element {
  return (
    <div
      aria-label={ariaLabel}
      className={timerOnly ? 'daily-hub-scoreboard--timer-only' : undefined}
      style={{
        width: align === 'left' ? 'auto' : '100%',
        maxWidth: align === 'left' ? 'none' : spacious ? 360 : 340,
        padding: 0,
        display: 'grid',
        gridTemplateColumns: timerOnly
          ? 'minmax(0, 1fr)'
          : align === 'left'
            ? 'max-content max-content'
            : 'repeat(2, minmax(0, 1fr))',
        alignItems: 'center',
        justifyContent: spacious ? 'center' : undefined,
        justifyItems: timerOnly ? 'center' : align === 'left' ? 'start' : 'center',
        gap:
          align === 'left'
            ? 36
            : timerOnly
              ? 0
              : spacious
                ? 'clamp(28px, 5vw, 40px)'
                : 'clamp(18px, 3vw, 28px)',
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

export interface DuelEventTiming {
  activePeriod: number | null;
  ariaLabel: string;
  label: string;
  value: string;
}

export function timestampMs(iso: string | null): number {
  if (!iso) return 0;
  const value = new Date(iso).getTime();
  return Number.isFinite(value) ? value : 0;
}

export function duelMatchNowMs(match: AmateurDuelMatch, fallbackNow: number): number {
  const serverNow = timestampMs(match.server_now);
  const receivedAt = match.received_at_performance_ms;
  if (serverNow > 0 && typeof receivedAt === 'number' && typeof performance !== 'undefined') {
    return serverNow + Math.max(0, performance.now() - receivedAt);
  }
  return fallbackNow;
}

export function isArenaDuelEvent(match: AmateurDuelMatch): boolean {
  return match.status === 'invited' || match.status === 'ready_check' || match.status === 'active';
}

export function canStartArenaDuelPeriod(
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

export function isDuelInviteForMe(match: AmateurDuelMatch): boolean {
  return match.status === 'invited' && match.me.side === 'opponent' && match.me.state === 'invited';
}

export function isDuelInviteFromMe(match: AmateurDuelMatch): boolean {
  return match.status === 'invited' && match.me.side === 'challenger';
}

export function arenaDuelCtaLabel(match: AmateurDuelMatch, fallbackNow: number): string {
  const nowMs = duelMatchNowMs(match, fallbackNow);
  if (match.me.state === 'period_active') return 'Продолжить дуэль';
  if (match.status === 'settled') return 'Показать результат';
  if (match.status === 'cancelled' || match.status === 'expired') return 'Дуэль завершена';
  if (isDuelInviteFromMe(match)) return 'Ждём ответ';
  if (canStartArenaDuelPeriod(match, nowMs)) return 'Начать дуэль';
  if (isDuelInviteForMe(match)) return 'Принять вызов';
  if (match.status === 'ready_check' && match.me.state !== 'ready') return 'К дуэли';
  if (match.status === 'ready_check' && match.me.state === 'ready') return 'Ждём готовность';
  if (match.me.state === 'break_active') return 'Перерыв';
  if (match.status === 'active' && match.opponent.state === 'period_active')
    return 'Соперник играет';
  if (match.me.state === 'completed' || match.me.state === 'forfeit') return 'Вы сыграли';
  return 'К дуэли';
}

export function duelNextPeriod(match: AmateurDuelMatch): number {
  if (match.me.state === 'period_active') return match.me.current_period;
  return Math.min(match.rules.totalPeriods, Math.max(1, match.me.current_period + 1));
}

export function duelParticipantPeriodRule(
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

export function intermissionContinueDeadlineMs(participant: AmateurDuelMatch['me']): number {
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
  const score = duelScorePairText(match.rules.duelKind, match.me, match.opponent);

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
        ariaLabel: `До технического поражения ${value}. Счёт ${score}`,
        label: 'До технического поражения',
        value,
      };
    }
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

  if (match.status === 'active') {
    const opponentContinueDeadline = intermissionContinueDeadlineMs(match.opponent);
    if (
      opponentContinueDeadline > now &&
      (match.me.state === 'completed' || match.me.state === 'forfeit')
    ) {
      const value = formatMs(opponentContinueDeadline - now);
      return {
        activePeriod: duelNextPeriod(match),
        ariaLabel: `Ждём завершения игры соперника ${value}. Счёт ${score}`,
        label: 'Ждём завершения игры соперника',
        value,
      };
    }
  }

  if (match.status === 'active' && endsAt > now) {
    const value = formatMs(endsAt - now);
    const waitingForOpponent = match.me.state === 'completed' || match.me.state === 'forfeit';
    const label =
      match.me.state === 'accepted'
        ? match.me.current_period === 0
          ? 'До конца игры'
          : 'До технического поражения'
        : waitingForOpponent
          ? 'Ждём завершения игры соперника'
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
    ariaLabel: `Время игрока ${formatDurationMs(match.me.active_duration_ms)}. Счёт ${score}`,
    label: 'Время',
    value: formatDurationMs(match.me.active_duration_ms),
  };
}

export function DailyPeriodTabs({
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

export function DailyPeriodTab({
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
        background: active ? 'var(--cube-period-active-bg, var(--liquid-selected-bg))' : 'var(--liquid-inset-bg)',
        border: active
          ? '1px solid var(--cube-period-border, rgba(182, 238, 255, 0.72))'
          : '1px solid var(--cube-period-border, rgba(118, 215, 255, 0.24))',
        color: active ? 'var(--cube-period-active-ink, #e9fbff)' : 'var(--cube-period-ink, rgba(174, 233, 255, 0.46))',
        boxShadow: active
          ? 'var(--cube-period-shadow, 0 0 9px rgba(122, 229, 255, 0.54), inset 0 0 8px rgba(82, 205, 255, 0.24))'
          : 'none',
      }}
    >
      {children}
    </span>
  );
}

export function DailyEventScoreboardColumn({
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
      <DailyEventScoreboardLabel align={align}>{label}</DailyEventScoreboardLabel>
      <span
        style={{
          color: 'var(--cube-timer-ink, #e9fbff)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'clamp(13px, 2.05vh, 18px)',
          fontWeight: 950,
          lineHeight: 1,
          letterSpacing: '0.06em',
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          textShadow: 'var(--cube-timer-shadow, 0 0 7px rgba(143, 232, 255, 0.72), 0 0 14px rgba(44, 177, 255, 0.38))',
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function DailyEventScoreboardLabel({
  align = 'center',
  children,
}: {
  align?: 'center' | 'left';
  children: React.ReactNode;
}): JSX.Element {
  return (
    <span
      style={{
        color: 'var(--cube-score-label, rgba(187, 238, 255, 0.72))',
        fontSize: 'clamp(6px, 0.95vh, 8px)',
        fontWeight: 900,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        maxWidth: '100%',
        overflowWrap: 'anywhere',
        textAlign: align,
        whiteSpace: 'normal',
        textShadow: 'var(--cube-label-shadow, 0 0 7px rgba(88, 207, 255, 0.36))',
      }}
    >
      {children}
    </span>
  );
}

export function ModeInfoModal({
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
        background: 'var(--liquid-scrim)',
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

export function DuelStatsModal({
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
        background: 'var(--liquid-scrim)',
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
                color: 'var(--liquid-muted)',
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
          aria-label={`Счёт дуэли ${duelScorePairText(match.rules.duelKind, match.me, match.opponent)}`}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 8,
            marginBottom: 14,
          }}
        >
          <DailyStatsMetric
            label="Счёт"
            value={duelScorePairText(match.rules.duelKind, match.me, match.opponent)}
          />
          <DailyStatsMetric label="Время" value={formatDurationMs(match.me.active_duration_ms)} />
          <DailyStatsMetric label="Период" value={`${currentPeriod}/${match.rules.totalPeriods}`} />
        </div>

        <DuelStatsInfoGrid
          items={[
            {
              label: 'Формат',
              value: `${duelFormatLabel(match.rules)} · ${match.rules.totalPeriods}П`,
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

export function DuelStatsInfoGrid({
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
            background: 'var(--liquid-inset-bg)',
            border: '1px solid rgba(255, 255, 255, 0.58)',
          }}
        >
          <div
            style={{
              color: 'var(--liquid-muted)',
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

export function DuelStatsParticipantRow({
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
        background: 'var(--liquid-inset-bg)',
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
            color: 'var(--liquid-muted)',
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
                color: 'var(--liquid-muted)',
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

export function duelParticipantStateText(state: AmateurDuelMatch['me']['state']): string {
  if (state === 'invited') return 'ждёт ответ';
  if (state === 'loadout_pending') return 'выбор';
  if (state === 'ready') return 'готов';
  if (state === 'accepted') return 'можно играть';
  if (state === 'period_active') return 'играет';
  if (state === 'break_active') return 'перерыв';
  if (state === 'completed') return 'завершил';
  return 'не сыграл';
}

export function DailyStatsMetric({ label, value }: { label: string; value: string }): JSX.Element {
  const isTime = label === 'Время';
  return (
    <div
      style={{
        borderRadius: 16,
        padding: '12px 4px',
        textAlign: 'center',
        background: 'var(--daily-stats-metric-bg, var(--liquid-inset-bg))',
        border: '1px solid rgba(255, 255, 255, 0.7)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.72)',
      }}
    >
      <div
        style={{
          color: 'var(--daily-stats-label, var(--liquid-muted))',
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

export function formatShortDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function duelOutcomeText(match: AmateurDuelMatch): string {
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

export function DuelLoadoutSummary({ match }: { match: AmateurDuelMatch }): JSX.Element {
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

export function DuelInventoryUsageSummary({
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
  const useSectionHeading = compact || title === 'Общий расход инвентаря';
  return (
    <div aria-label={label ?? title} style={{ display: 'grid', gap: compact ? 5 : 6, ...style }}>
      <div
        className={useSectionHeading ? 'section-label' : undefined}
        style={
          useSectionHeading
            ? { margin: 0, padding: 0 }
            : { color: 'var(--muted)', fontSize: 11, fontWeight: 900 }
        }
      >
        {title}
      </div>
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

export const DUEL_INVENTORY_SLOTS = [
  { kind: 'skates', label: 'Коньки' },
  { kind: 'stick', label: 'Клюшка' },
  { kind: 'nutrition', label: 'Энергия' },
] as const;

export const DUEL_INVENTORY_ICON_GLASS_STYLE: CSSProperties = {
  background: 'var(--liquid-inset-bg)',
  border: '1px solid rgba(255,255,255,0.82)',
  boxShadow:
    '0 0 0 1px rgba(15,23,42,0.07), 0 8px 18px rgba(15,23,42,0.14), inset 0 1.5px 0 rgba(255,255,255,0.88), inset 0 -8px 16px rgba(15,23,42,0.06)',
};

export function DuelInventorySlots({ match }: { match: AmateurDuelMatch }): JSX.Element {
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
              background: 'var(--liquid-inset-bg)',
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

export function duelInventoryUsageRows(
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

export function duelInventoryRemaining(match: AmateurDuelMatch, itemId: string, fallback: number): number {
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

export function duelConsumedForPeriodItem(
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

export function duelConsumedBeforePeriodItem(
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

export function duelConsumedForItem(match: AmateurDuelMatch, itemId: string): number {
  return match.me.inventory_report
    .flatMap((report) => report.consumed)
    .filter((item) => item.id === itemId)
    .reduce((sum, item) => sum + item.charges, 0);
}

export function RecoveryKitModal({
  action,
  onApplied,
  onClose,
}: {
  action: 'start_daily_period' | 'start_classic';
  onApplied: () => void | Promise<void>;
  onClose: () => void;
}): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const amateurAccess = useAmateurAccess();
  const inventory = useQuery<InventoryState>({
    queryKey: ['inventory', 'me'],
    queryFn: fetchMyInventory,
  });
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const variants = Array.from(
    new Map(
      (inventory.data?.items.recovery ?? []).map((item) => [item.itemId ?? item.id, item]),
    ).values(),
  );
  const stockFor = (itemId: string): number =>
    (inventory.data?.items.recovery ?? [])
      .filter((item) => (item.itemId ?? item.id) === itemId)
      .reduce((sum, item) => sum + item.chargesAvailable, 0);
  const selected = variants.find((item) => (item.itemId ?? item.id) === selectedItemId) ?? null;
  const selectedStock = selected === null ? 0 : stockFor(selected.itemId ?? selected.id);
  const mutation = useMutation({
    mutationFn: (item: InventoryItem) =>
      useRecoveryKit({
        itemId: item.itemId ?? item.id,
        action,
        buyIfNeeded: stockFor(item.itemId ?? item.id) === 0,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: async (result) => {
      queryClient.setQueryData(['inventory', 'me'], result.inventory);
      await onApplied();
      onClose();
    },
  });

  const applySelected = () => {
    if (selected === null) return;
    if (action === 'start_classic') guardAmateurMutation(amateurAccess, () => mutation.mutate(selected));
    else mutation.mutate(selected);
  };

  return (
    <AccessibleModal
      title="Сократить восстановление"
      copy="Выберите одноразовый набор. Перед применением проверьте время и стоимость."
      onRequestClose={onClose}
      closeBlocked={mutation.isPending}
      headerAction={
        <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
          <X size={15} />
        </button>
      }
    >
      <div className="recovery-kit-options">
        {variants.map((item) => {
          const itemId = item.itemId ?? item.id;
          const stock = stockFor(itemId);
          const minutes = item.effectRecoveryMinutes ?? 0;
          return (
            <button
              type="button"
              key={itemId}
              className={`recovery-kit-option${selectedItemId === itemId ? ' recovery-kit-option--selected' : ''}`}
              onClick={() => setSelectedItemId(itemId)}
            >
              <img src={item.imageUrl ?? '/inventory/recovery-30.webp'} alt="" />
              <span>
                <strong>{minutes === 60 ? '1 час' : `${minutes} минут`}</strong>
                <small>{stock > 0 ? `В запасе: ${stock}` : <CurrencyAmount amount={item.currencyPrice} currency="coins"/>}</small>
              </span>
              <DuelEquipmentSelectionRadio selected={selectedItemId === itemId} />
            </button>
          );
        })}
      </div>
      {mutation.error && amateurAccessDetailsFromError(mutation.error) === null && (
        <p className="modal-copy" role="alert">
          {mutation.error.message}
        </p>
      )}
      <div className="modal-actions">
        {mutation.isError && mutation.error.message.includes('currency') ? (
          <button type="button" className="btn btn--ghost" onClick={() => navigate('/inventory')}>
            В банк
          </button>
        ) : null}
        {selected !== null && selectedStock <= 0 ? (
          <PurchaseAction amount={selected.currencyPrice} currency="coins" suffix="и применить" pending={mutation.isPending} pendingLabel="Применяем..."
          onClick={applySelected}/>
        ) : (
        <button
          type="button"
          className="modal-primary btn--cta"
          disabled={selected === null || mutation.isPending}
          onClick={applySelected}
        >
          {mutation.isPending
            ? 'Применяем...'
            : selected === null
              ? 'Выберите набор'
              : 'Использовать набор'}
        </button>
        )}

      </div>
    </AccessibleModal>
  );
}
