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
import { Container } from 'pixi.js';
import type { Application, Ticker } from 'pixi.js';
import { Home, VolumeX } from 'lucide-react';
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
  type DuelPlayerCondition,
  type GoalieConfig,
  type SessionPhaseOffsets,
  type ShotInput,
  type ShotResult,
  type StickEffects,
} from '@hockey/game-core';
import { useAuthStore } from '../auth/authStore.js';
import {
  buildGameScoreboardModel,
  GameScoreboard,
  ScoreBoard,
  type ScoreBoardOpponent,
} from '../components/ScoreBoard.js';
import { ResultModal, type ResultModalKind } from '../components/ResultModal.js';
import type { Scale } from './coords.js';
import { createGameLoop, type GameLoop, type SpeedOverrides } from './loop.js';
import { PixiStage } from './PixiStage.js';
import { Goal, type GoalOptions } from './renderer/Goal.js';
import { Goalie, type GoalieOptions } from './renderer/Goalie.js';
import { Hitboxes, type HitboxesOptions } from './renderer/Hitboxes.js';
import { IceCar, iceCarPosAt } from './renderer/IceCar.js';
import { Player, type PlayerOptions } from './renderer/Player.js';
import { Puck, type PuckOptions } from './renderer/Puck.js';
import {
  TRAINING_LONG_COURT_BACKGROUND,
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
  TRAINING_NEW_COURT_POST_EDGE_DISTANCE,
  TRAINING_NEW_COURT_PUCK_BLADE_OFFSET_X,
  TRAINING_NEW_COURT_PUCK_BLADE_OFFSET_Y,
  TRAINING_NEW_COURT_PUCK_FLIGHT_VISUAL_Y_OFFSET,
  TRAINING_NEW_COURT_VISUAL_Y_OFFSET,
  TRAINING_NEW_COURT_VISUAL_Y_SCALE,
  distanceToNewTrainingCourtGoalEdge,
  resolveNewTrainingCourtShot,
  type TrainingCourtDesign,
} from './trainingNewCourt.js';

const PAUSE_MS = 1000;

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

const PLAY_ROUTE_TRANSITION_MS = 580;

const LONG_COURT_RINK_ASPECT_RATIO = '1212 / 2000';

const LONG_COURT_GAME_LAYER_STYLE: CSSProperties = {
  top: '24.55%',
  height: '74.2%',
  bottom: 'auto',
};

function shouldReduceMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function periodSpeedPresetFor(
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

export function speedOverridesForPeriod(
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

export function clampPuckSpeed(value: number): number {
  return Math.min(5, Math.max(0.2, Number(value.toFixed(4))));
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
    iceCar.update(scaleRef.current, pos.x, pos.y, pos.rot, pos.variant);
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

export function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

const DUEL_STUMBLE_NOTICE_MS = 650;

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

export function duelPrimaryButtonLabel(
  baseLabel: string,
  condition: DuelPlayerCondition | null,
): string {
  if (!condition || condition.canShoot) return baseLabel;
  if (condition.status === 'exhausted_stop') return 'ОТДЫХ';
  return baseLabel;
}

export function duelFatigueNoticeLabel(condition: DuelPlayerCondition | null): string | null {
  if (!condition) return null;
  if (condition.status === 'exhausted_stop') return 'Надо отдышаться';
  if (condition.status !== 'tired') return null;
  return 'Усталость';
}

function duelConditionSignature(condition: DuelPlayerCondition | null): string {
  if (!condition) return 'none';
  return [
    condition.status,
    condition.fatigueLevel,
    condition.canShoot ? '1' : '0',
    condition.stumbleActive ? '1' : '0',
    condition.shooterSpeedMultiplier.toFixed(4),
    condition.puckSpeedDelta.toFixed(4),
  ].join(':');
}

export interface PlayViewProps<TState> {
  suppressedByModal: boolean;
  showIceCar: boolean;
  playEntranceOnMount?: boolean | undefined;
  onEntranceConsumed?: (() => void) | undefined;
  playRouteTransitionOnMount?: boolean | undefined;
  onRouteTransitionConsumed?: (() => void) | undefined;
  onBack: () => void;
  active: boolean;
  seed: string | null;
  goalieId: string | null;
  goalieConfig?: GoalieConfig | undefined;
  periodNumber: number;
  periodSpeedPresets?: readonly DailyPeriodSpeedPreset[] | undefined;
  speedOverrides?: SpeedOverrides | undefined;
  stickEffects?: StickEffects | undefined;
  periodsTotal?: number;
  scoreboardPeriodsTotal?: number;
  goals: number;
  scoreboardGoals?: number | undefined;
  shots: number;
  shotsTotal?: number | undefined;
  timer?: string | undefined;
  timerLabel?: string | undefined;
  scoreboardNotice?: string | undefined;
  shotButtonLabel?: string | undefined;
  primaryActionBlocked?: boolean | undefined;
  inactiveAction?: (() => unknown | Promise<unknown>) | undefined;
  entranceBeforeInactiveAction?: boolean | undefined;
  backLabel?: string | undefined;
  bottomInset?: string | undefined;
  sessionStartedAt?: string | null | undefined;
  serverNow?: string | null | undefined;
  receivedAtPerformanceMs?: number | undefined;
  initialSceneElapsedMs?: number | undefined;
  initialShooterElapsedMs?: number | undefined;
  clockRebaseKey?: string | number | undefined;
  periodEndsAt?: number | undefined;
  onTimerExpired?: (() => void | Promise<void>) | undefined;
  optimisticAddShot: (claimed: ShotResult['type']) => void;
  submitShot: (args: {
    shotIndex: number;
    input: ShotInput;
    claimedResult: ShotResult['type'];
  }) => Promise<{ serverResult: ShotResult['type']; state: TState } | null>;
  applyState: (next: TState) => void;
  applyResolvedState?: ((next: TState) => void) | undefined;
  rinkLayer?: ReactNode;
  longCourtBackground?: string | undefined;
  rinkAspectRatio?: string | undefined;
  rinkBorderRadius?: number | string | undefined;
  rinkBorder?: string | undefined;
  hideScoreboard?: boolean | undefined;
  overlayControls?: ReactNode;
  gameLayerStyle?: CSSProperties | undefined;
  playerGrip?: 'left' | 'right' | undefined;
  playerOptions?: PlayerOptions | undefined;
  goalOptions?: GoalOptions | undefined;
  goalieOptions?: GoalieOptions | undefined;
  preloadAssets?: readonly string[] | undefined;
  puckOptions?: PuckOptions | undefined;
  hitboxesVisible?: boolean | undefined;
  hitboxesOptions?: HitboxesOptions | undefined;
  shotResolver?: PlayShotResolver | undefined;
  duelCondition?:
    | ((elapsedMs: number, speeds: SpeedOverrides) => DuelPlayerCondition | null)
    | undefined;
  hudAddon?: ReactNode;
  scoreboardOpponent?: ScoreBoardOpponent | undefined;
  readyPresence?: ReadyPresence | undefined;
}

export interface ReadyPresence {
  playerReady: boolean;
  goalieReady: boolean;
  playerEntranceKey?: string | null | undefined;
  goalieEntranceKey?: string | null | undefined;
}

interface PlaySessionSnapshot {
  active: boolean;
  seed: string | null;
  goalieId: string | null;
  goalieConfig: GoalieConfig | null;
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
  stumbleSpriteUrl: '/sprites/player-falling.webp',
  restSpriteUrl: '/sprites/player-rest.webp',
  spriteWidth: 101,
  spriteAspect: 942 / 1067,
  stumbleSpriteWidth: 110,
  stumbleSpriteAspect: 1130 / 1150,
  stumbleRotation: 0,
  restSpriteWidth: 84,
  restSpriteAspect: 1000 / 1374,
  restRotation: 0,
  baseRotation: 0,
  shotMaxRotation: 0,
  shotDurationMs: 500,
  visualYScale: TRAINING_NEW_COURT_VISUAL_Y_SCALE,
  visualYOffset: TRAINING_NEW_COURT_VISUAL_Y_OFFSET,
  shadow: true,
};

export const TRAINING_STREET_PLAYER_OPTIONS: PlayerOptions = {
  ...PERSPECTIVE_PLAYER_OPTIONS,
  spriteUrls: {
    left: '/sprites/street-player-left.webp',
    right: '/sprites/street-player-right.webp',
  },
  shotSpriteUrls: {
    left: '/sprites/street-player-left-shoot.webp',
    right: '/sprites/street-player-right-shoot.webp',
  },
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

export const TRAINING_AMATEUR_GOALIE_OPTIONS: GoalieOptions = {
  ...PERSPECTIVE_GOALIE_OPTIONS,
  idleSpriteUrl: '/sprites/training-goalie-amateur.webp',
  saveSpriteUrl: '/sprites/training-goalie-amateur-save.webp',
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
  initialSceneElapsedMs?: number | null;
  initialShooterElapsedMs?: number | null;
}

export function computeInitialPlayClocks(timing: PlaySessionTiming): {
  sceneElapsedMs: number;
  shooterElapsedMs: number;
} {
  const receivedAt = timing.receivedAtPerformanceMs ?? performance.now();
  const clientElapsed = Math.max(0, performance.now() - receivedAt);
  if (timing.initialSceneElapsedMs != null && timing.initialShooterElapsedMs != null) {
    return {
      sceneElapsedMs: Math.max(0, timing.initialSceneElapsedMs) + clientElapsed,
      shooterElapsedMs: Math.max(0, timing.initialShooterElapsedMs) + clientElapsed,
    };
  }
  if (!timing.sessionStartedAt || !timing.serverNow) {
    return { sceneElapsedMs: 0, shooterElapsedMs: 0 };
  }
  const started = Date.parse(timing.sessionStartedAt);
  const serverNowMs = Date.parse(timing.serverNow);
  if (!Number.isFinite(started) || !Number.isFinite(serverNowMs)) {
    return { sceneElapsedMs: 0, shooterElapsedMs: 0 };
  }
  const elapsedMs = Math.max(0, serverNowMs - started) + clientElapsed;
  return { sceneElapsedMs: elapsedMs, shooterElapsedMs: elapsedMs };
}

export function computeInitialElapsedMs(timing: PlaySessionTiming): number {
  return computeInitialPlayClocks(timing).sceneElapsedMs;
}

function TrainingPerspectiveRink({
  design = 'standard',
  scoreboard,
  longBackground = TRAINING_LONG_COURT_BACKGROUND,
}: {
  design?: TrainingCourtDesign | undefined;
  scoreboard?: ReactNode;
  longBackground?: string | undefined;
}): JSX.Element {
  const isLong = design === 'long';
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
        src={isLong ? longBackground : TRAINING_NEW_COURT_BACKGROUND}
        alt=""
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: isLong ? '100%' : `calc(100% + ${TRAINING_NEW_COURT_BG_CROP_BOTTOM})`,
          objectFit: 'cover',
        }}
      />
      {isLong && (
        <div
          aria-hidden={scoreboard ? undefined : true}
          className="game-scoreboard-overlay"
          style={{
            position: 'absolute',
            top: '3%',
            left: '50%',
            width: '86%',
            maxWidth: 404,
            transform: 'translateX(-50%)',
            containerType: 'inline-size',
          }}
        >
          {scoreboard}
        </div>
      )}
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
  goalieConfig,
  periodNumber,
  periodSpeedPresets,
  speedOverrides,
  stickEffects = STICK_NEUTRAL,
  periodsTotal = 3,
  scoreboardPeriodsTotal,
  goals,
  scoreboardGoals,
  shots,
  shotsTotal,
  timer,
  timerLabel,
  scoreboardNotice,
  shotButtonLabel = 'БРОСОК',
  primaryActionBlocked = false,
  inactiveAction,
  entranceBeforeInactiveAction = false,
  backLabel = 'К режимам',
  bottomInset = 'calc(8px + var(--app-dock-safe-bottom))',
  sessionStartedAt,
  serverNow,
  receivedAtPerformanceMs,
  initialSceneElapsedMs,
  initialShooterElapsedMs,
  clockRebaseKey,
  periodEndsAt,
  onTimerExpired,
  optimisticAddShot,
  submitShot,
  applyState,
  applyResolvedState,
  rinkLayer,
  longCourtBackground,
  rinkAspectRatio = LONG_COURT_RINK_ASPECT_RATIO,
  rinkBorderRadius = 36,
  rinkBorder = '3px solid #1e3a5f',
  hideScoreboard = true,
  overlayControls,
  gameLayerStyle = LONG_COURT_GAME_LAYER_STYLE,
  playerGrip,
  playerOptions = PERSPECTIVE_PLAYER_OPTIONS,
  goalOptions = PERSPECTIVE_GOAL_OPTIONS,
  goalieOptions = PERSPECTIVE_GOALIE_OPTIONS,
  preloadAssets,
  puckOptions = PERSPECTIVE_PUCK_OPTIONS,
  hitboxesVisible = false,
  hitboxesOptions = PERSPECTIVE_HITBOX_OPTIONS,
  shotResolver = resolveNewTrainingCourtShot,
  duelCondition,
  hudAddon,
  scoreboardOpponent,
  readyPresence,
}: PlayViewProps<TState>): JSX.Element {
  const session: PlaySessionSnapshot = useMemo(
    () => ({
      active,
      seed,
      goalieId,
      goalieConfig: goalieConfig ?? null,
      periodNumber,
      shots,
      shotsTotal,
    }),
    [active, seed, goalieId, goalieConfig, periodNumber, shots, shotsTotal],
  );
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const sessionTimingRef = useRef<PlaySessionTiming>({
    sessionStartedAt: sessionStartedAt ?? null,
    serverNow: serverNow ?? null,
    receivedAtPerformanceMs: receivedAtPerformanceMs ?? null,
    initialSceneElapsedMs: initialSceneElapsedMs ?? null,
    initialShooterElapsedMs: initialShooterElapsedMs ?? null,
  });
  sessionTimingRef.current = {
    sessionStartedAt: sessionStartedAt ?? null,
    serverNow: serverNow ?? null,
    receivedAtPerformanceMs: receivedAtPerformanceMs ?? null,
    initialSceneElapsedMs: initialSceneElapsedMs ?? null,
    initialShooterElapsedMs: initialShooterElapsedMs ?? null,
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
  const skipNextUnsuppressedEntranceRef = useRef(false);
  const iceCarRef = useRef<IceCar | null>(null);
  const iceCarRafRef = useRef<number | null>(null);
  const shotTimeoutsRef = useRef<number[]>([]);
  const mountedRef = useRef(true);
  const initializedRef = useRef(false);
  const [isShowingResult, setIsShowingResult] = useState(false);
  const [isShotInProgress, setIsShotInProgress] = useState(false);
  const [isShotSubmitPending, setIsShotSubmitPending] = useState(false);
  const [isInactiveActionPending, setIsInactiveActionPending] = useState(false);
  const [soundToastVisible, setSoundToastVisible] = useState(false);
  const soundToastTimerRef = useRef<number | null>(null);
  const [duelStumbleNoticeVisible, setDuelStumbleNoticeVisible] = useState(false);
  const duelStumbleNoticeTimerRef = useRef<number | null>(null);
  const wasDuelStumblingRef = useRef(false);
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
  const pendingClockRebaseRef = useRef(false);
  const shotAnimationInProgressRef = useRef(false);
  const shotSubmitPendingRef = useRef(false);
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
  const goalieConfigRef = useRef<GoalieConfig | null>(goalieConfig ?? null);
  goalieConfigRef.current = goalieConfig ?? null;
  const puckOptionsRef = useRef(puckOptions);
  puckOptionsRef.current = puckOptions;
  const hitboxesVisibleRef = useRef(hitboxesVisible);
  hitboxesVisibleRef.current = hitboxesVisible;
  const hitboxesOptionsRef = useRef(hitboxesOptions);
  hitboxesOptionsRef.current = hitboxesOptions;
  const shotResolverRef = useRef(shotResolver);
  shotResolverRef.current = shotResolver;
  const duelConditionRef = useRef(duelCondition);
  duelConditionRef.current = duelCondition;
  const readyPresenceRef = useRef(readyPresence);
  readyPresenceRef.current = readyPresence;
  const wasReadyPresenceModeRef = useRef(false);
  const lastReadyPlayerEntranceKeyRef = useRef(readyPresence?.playerEntranceKey ?? null);
  const lastReadyGoalieEntranceKeyRef = useRef(readyPresence?.goalieEntranceKey ?? null);

  const speeds = useMemo(
    () => speedOverrides ?? speedOverridesForPeriod(periodNumber, periodSpeedPresets),
    [periodNumber, periodSpeedPresets, speedOverrides],
  );
  const rinkRatio = useMemo(() => parseAspectRatio(rinkAspectRatio), [rinkAspectRatio]);
  const speedsRef = useRef<SpeedOverrides>(speeds);
  speedsRef.current = speeds;
  const stickEffectsRef = useRef<StickEffects>(stickEffects);
  stickEffectsRef.current = stickEffects;

  const [now, setNow] = useState(Date.now());
  const [currentDuelCondition, setCurrentDuelCondition] = useState<DuelPlayerCondition | null>(
    () =>
      active && duelCondition
        ? duelCondition(computeInitialElapsedMs(sessionTimingRef.current), speeds)
        : null,
  );
  const currentDuelConditionSignatureRef = useRef<string>('');

  const syncCurrentDuelCondition = useCallback((condition: DuelPlayerCondition | null): void => {
    const signature = duelConditionSignature(condition);
    if (signature === currentDuelConditionSignatureRef.current) return;
    currentDuelConditionSignatureRef.current = signature;
    setCurrentDuelCondition(condition);
  }, []);

  useEffect(() => {
    if (pixiReady && active) return;
    syncCurrentDuelCondition(
      active && duelCondition
        ? duelCondition(computeInitialElapsedMs(sessionTimingRef.current), speeds)
        : null,
    );
  }, [
    active,
    duelCondition,
    receivedAtPerformanceMs,
    serverNow,
    sessionStartedAt,
    pixiReady,
    speeds,
    syncCurrentDuelCondition,
  ]);

  const isDuelStumbling = currentDuelCondition?.stumbleActive === true;

  useEffect(() => {
    if (!active) {
      wasDuelStumblingRef.current = false;
      setDuelStumbleNoticeVisible(false);
      if (duelStumbleNoticeTimerRef.current !== null) {
        window.clearTimeout(duelStumbleNoticeTimerRef.current);
        duelStumbleNoticeTimerRef.current = null;
      }
      return;
    }

    if (isDuelStumbling && !wasDuelStumblingRef.current) {
      setDuelStumbleNoticeVisible(true);
      if (duelStumbleNoticeTimerRef.current !== null) {
        window.clearTimeout(duelStumbleNoticeTimerRef.current);
      }
      duelStumbleNoticeTimerRef.current = window.setTimeout(() => {
        setDuelStumbleNoticeVisible(false);
        duelStumbleNoticeTimerRef.current = null;
      }, DUEL_STUMBLE_NOTICE_MS);
    }
    wasDuelStumblingRef.current = isDuelStumbling;
  }, [active, isDuelStumbling]);

  useEffect(
    () => () => {
      if (soundToastTimerRef.current !== null) {
        window.clearTimeout(soundToastTimerRef.current);
      }
      if (duelStumbleNoticeTimerRef.current !== null) {
        window.clearTimeout(duelStumbleNoticeTimerRef.current);
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

  const startEntranceAnimation = useCallback(
    (
      loop: GameLoop,
      ticker: Ticker,
      options: { attachOnComplete?: boolean; animateGoal?: boolean } = {},
    ): Promise<void> =>
      new Promise((resolve) => {
        if (entranceRafRef.current !== null) {
          cancelAnimationFrame(entranceRafRef.current);
          entranceRafRef.current = null;
        }
        const goal = goalRef.current;
        const player = playerRef.current;
        const goalie = goalieRef.current;
        const puck = puckRef.current;
        if (!goal || !player || !goalie || !puck) {
          resolve();
          return;
        }

        loop.detach();
        setIsEntrancePlaying(true);

        const attachOnComplete = options.attachOnComplete ?? true;
        const animateGoal = options.animateGoal ?? true;
        const ENTRY_DURATION_MS = 1400;
        const CENTER_RED_Y = 350;
        const ENTRY_X = RINK.width + 50;
        const goalieStartX = ENTRY_X;
        const goalieStartY = CENTER_RED_Y - 30;
        const playerStartX = ENTRY_X;
        const playerStartY = CENTER_RED_Y + 30;
        const goalStartOffsetY = animateGoal ? -140 : 0;
        const t0 = performance.now();

        goal.container.visible = true;
        player.container.visible = true;
        goalie.container.visible = true;
        puck.container.visible = false;

        const drawAt = (
          gx: number,
          gy: number,
          px: number,
          py: number,
          goalOffsetY: number,
        ): void => {
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
          if (!mountedRef.current) {
            resolve();
            return;
          }
          const t = Math.min(1, (performance.now() - t0) / ENTRY_DURATION_MS);
          const eased = 1 - Math.pow(1 - t, 3);
          drawAt(
            goalieStartX + (SHOOTER_CENTER_X - goalieStartX) * eased,
            goalieStartY + (GOALIE_Y - goalieStartY) * eased,
            playerStartX + (SHOOTER_CENTER_X - playerStartX) * eased,
            playerStartY + (PUCK_START.y - playerStartY) * eased,
            animateGoal ? goalStartOffsetY * (1 - eased) : 0,
          );
          if (t < 1) {
            entranceRafRef.current = requestAnimationFrame(step);
            return;
          }
          entranceRafRef.current = null;
          goal.update(scaleRef.current, 0, 0);
          puck.container.visible = true;
          loop.resetTime();
          if (attachOnComplete) loop.attach(ticker);
          setIsEntrancePlaying(false);
          resolve();
        };

        entranceRafRef.current = requestAnimationFrame(step);
      }),
    [],
  );

  const drawReadyPresence = useCallback((presence: ReadyPresence): void => {
    const goal = goalRef.current;
    const player = playerRef.current;
    const goalie = goalieRef.current;
    const puck = puckRef.current;
    if (!goal || !player || !goalie || !puck) return;

    goal.container.visible = presence.goalieReady;
    goalie.container.visible = presence.goalieReady;
    player.container.visible = presence.playerReady;
    puck.container.visible = presence.playerReady;
    goal.update(scaleRef.current, 0, 0);
    if (presence.goalieReady) {
      goalie.update(
        {
          position: { x: SHOOTER_CENTER_X, y: GOALIE_Y },
          width: GOALIE_SIZE.width,
          height: GOALIE_SIZE.height,
        },
        scaleRef.current,
      );
    }
    if (presence.playerReady) {
      player.update(scaleRef.current, SHOOTER_CENTER_X, PUCK_START.y);
      puck.resetAtStart(scaleRef.current);
    }
  }, []);

  const startReadyPresenceEntrance = useCallback(
    (part: 'player' | 'goalie'): void => {
      if (entranceRafRef.current !== null) {
        cancelAnimationFrame(entranceRafRef.current);
        entranceRafRef.current = null;
      }
      const goal = goalRef.current;
      const player = playerRef.current;
      const goalie = goalieRef.current;
      const puck = puckRef.current;
      const loop = loopRef.current;
      if (!goal || !player || !goalie || !puck) return;

      loop?.detach();
      wasReadyPresenceModeRef.current = true;
      setIsEntrancePlaying(true);

      const ENTRY_DURATION_MS = 900;
      const CENTER_RED_Y = 350;
      const ENTRY_X = RINK.width + 50;
      const t0 = performance.now();
      const existingPresence = readyPresenceRef.current ?? {
        playerReady: false,
        goalieReady: false,
      };

      if (part === 'player') {
        player.container.visible = true;
        puck.container.visible = false;
      } else {
        goal.container.visible = true;
        goalie.container.visible = true;
      }

      const step = (): void => {
        if (!mountedRef.current) return;
        const t = Math.min(1, (performance.now() - t0) / ENTRY_DURATION_MS);
        const eased = 1 - Math.pow(1 - t, 3);

        if (part === 'player') {
          const x = ENTRY_X + (SHOOTER_CENTER_X - ENTRY_X) * eased;
          const y = CENTER_RED_Y + 30 + (PUCK_START.y - (CENTER_RED_Y + 30)) * eased;
          player.update(scaleRef.current, x, y);
          if (existingPresence.goalieReady) {
            goal.update(scaleRef.current, 0, 0);
            goalie.update(
              {
                position: { x: SHOOTER_CENTER_X, y: GOALIE_Y },
                width: GOALIE_SIZE.width,
                height: GOALIE_SIZE.height,
              },
              scaleRef.current,
            );
          }
        } else {
          const x = ENTRY_X + (SHOOTER_CENTER_X - ENTRY_X) * eased;
          const y = CENTER_RED_Y - 30 + (GOALIE_Y - (CENTER_RED_Y - 30)) * eased;
          const goalOffsetY = -140 * (1 - eased);
          goal.update(scaleRef.current, 0, goalOffsetY);
          goalie.update(
            {
              position: { x, y },
              width: GOALIE_SIZE.width,
              height: GOALIE_SIZE.height,
            },
            scaleRef.current,
          );
          if (existingPresence.playerReady) {
            player.update(scaleRef.current, SHOOTER_CENTER_X, PUCK_START.y);
          }
        }

        if (t < 1) {
          entranceRafRef.current = requestAnimationFrame(step);
          return;
        }
        entranceRafRef.current = null;
        drawReadyPresence(readyPresenceRef.current ?? existingPresence);
        setIsEntrancePlaying(false);
      };

      entranceRafRef.current = requestAnimationFrame(step);
    },
    [drawReadyPresence],
  );

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
        getGoalieConfig: () => goalieConfigRef.current,
        getSpeedOverrides: () => speedsRef.current,
        getInitialClocks: () => computeInitialPlayClocks(sessionTimingRef.current),
        getDuelCondition: (elapsedMs, activeSpeeds) =>
          duelConditionRef.current?.(elapsedMs, activeSpeeds) ?? null,
        onDuelConditionChange: syncCurrentDuelCondition,
      });
      tickerRef.current = app.ticker;
      loopRef.current = loop;

      // Decide initial visibility/loop state synchronously, BEFORE the first
      // ticker frame, so a modal-on-top mount never flashes moving sprites.
      if (suppressedRef.current) {
        goal.container.visible = !showIceCarRef.current;
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
        if (readyPresenceRef.current && !sessionRef.current.active) {
          loop.detach();
          wasReadyPresenceModeRef.current = true;
          drawReadyPresence(readyPresenceRef.current);
          setPixiReady(true);
          return;
        }
        if (playEntranceOnMountRef.current && sessionRef.current.active) {
          onEntranceConsumedRef.current?.();
          void startEntranceAnimation(loop, app.ticker);
        } else {
          loop.attach(app.ticker);
        }
      }
      setPixiReady(true);
    },
    [drawReadyPresence, startEntranceAnimation, syncCurrentDuelCondition],
  );

  useLayoutEffect(() => {
    if (!pixiReady || clockRebaseKey === undefined) return;
    const loop = loopRef.current;
    if (!loop) return;
    if (shotAnimationInProgressRef.current) {
      pendingClockRebaseRef.current = true;
      return;
    }
    loop.rebaseTime(computeInitialPlayClocks(sessionTimingRef.current));
  }, [clockRebaseKey, pixiReady]);

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
      goal.container.visible = !showIceCar;
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
    if (readyPresence && !active) {
      loop.detach();
      wasReadyPresenceModeRef.current = true;
      drawReadyPresence(readyPresence);
      return;
    }
    if (active && wasReadyPresenceModeRef.current) {
      wasReadyPresenceModeRef.current = false;
      goal.container.visible = true;
      player.container.visible = true;
      goalie.container.visible = true;
      puck.container.visible = true;
      loop.resetTime();
      loop.attach(ticker);
      return;
    }
    if (skipNextUnsuppressedEntranceRef.current) {
      skipNextUnsuppressedEntranceRef.current = false;
      goal.container.visible = true;
      player.container.visible = true;
      goalie.container.visible = true;
      puck.container.visible = true;
      loop.resetTime();
      loop.attach(ticker);
      return;
    }
    void startEntranceAnimation(loop, ticker);
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
  }, [
    active,
    drawReadyPresence,
    pixiReady,
    readyPresence,
    showIceCar,
    startEntranceAnimation,
    suppressedByModal,
  ]);

  useEffect(() => {
    if (!pixiReady || !readyPresence || active || suppressedByModal) return;

    const playerKey = readyPresence.playerEntranceKey ?? null;
    const goalieKey = readyPresence.goalieEntranceKey ?? null;
    const shouldAnimatePlayer =
      readyPresence.playerReady &&
      playerKey !== null &&
      playerKey !== lastReadyPlayerEntranceKeyRef.current;
    const shouldAnimateGoalie =
      readyPresence.goalieReady &&
      goalieKey !== null &&
      goalieKey !== lastReadyGoalieEntranceKeyRef.current;

    lastReadyPlayerEntranceKeyRef.current = playerKey;
    lastReadyGoalieEntranceKeyRef.current = goalieKey;

    if (shouldAnimatePlayer) {
      startReadyPresenceEntrance('player');
      return;
    }
    if (shouldAnimateGoalie) {
      startReadyPresenceEntrance('goalie');
      return;
    }
    drawReadyPresence(readyPresence);
  }, [
    active,
    drawReadyPresence,
    pixiReady,
    readyPresence,
    startReadyPresenceEntrance,
    suppressedByModal,
  ]);

  const handleResize = useCallback((s: Scale): void => {
    refreshRef.current?.(s);
  }, []);

  const handleBackTap = useCallback((): void => {
    if (routeBackTimeoutRef.current !== null) return;
    onBack();
  }, [onBack]);

  const handleShotTap = useCallback((): void => {
    const loop = loopRef.current;
    const puck = puckRef.current;
    const goalie = goalieRef.current;
    const cur = sessionRef.current;
    if (!loop || !puck || !goalie) return;
    if (puck.isFlying() || puck.isHeld()) return;
    if (shotSubmitPendingRef.current) return;
    if (!cur.active) return;
    if (!cur.seed) return;
    if (typeof cur.shotsTotal === 'number' && cur.shots >= cur.shotsTotal) return;

    const shotIndex = cur.shots + 1;
    const goalieCfg = cur.goalieConfig ?? (cur.goalieId ? getGoalie(cur.goalieId) : null);
    if (!goalieCfg) return;
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
    const duelShotCondition = duelConditionRef.current?.(tapTime, overrides) ?? null;
    if (duelShotCondition && !duelShotCondition.canShoot) return;
    const effectiveShooterFreq = Math.max(
      0.1,
      overrides.shooterFreq * (duelShotCondition?.shooterSpeedMultiplier ?? 1),
    );
    const sx =
      computeShooterX(shooterTapTime + offsets.shooter, effectiveShooterFreq) +
      (duelShotCondition?.shooterXOffsetPx ?? 0);
    const puckSpeed = clampPuckSpeed(
      overrides.puckSpeed + (duelShotCondition?.puckSpeedDelta ?? 0),
    );

    const input = {
      tapTime,
      shooterTapTime,
      puckSpeedPerMs: puckSpeed,
      shooterFrequency: effectiveShooterFreq,
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
    const flightMs = (PUCK_START.y - GOAL_OPENING.y) / puckSpeed;
    const tGoalCross = tapTime + flightMs;
    const tGoalieCross = tapTime + (PUCK_START.y - GOALIE_Y) / puckSpeed;
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
    shotSubmitPendingRef.current = true;
    shotAnimationInProgressRef.current = true;
    setIsShotInProgress(true);
    setIsShotSubmitPending(true);
    pendingMidShotApplyRef.current = null;

    loop.beginShooterPause();
    playerRef.current?.playShot();
    const puckShotPath = puck.shotPath(sx, GOAL_OPENING.y);
    puck.playShot(puckShotPath.start, puckShotPath.end, loop.getRenderNow(), flightMs);

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
      puck.holdAt({
        x: puckShotPath.end.x,
        y: result.type === 'save' ? GOAL_OPENING.y + 20 : GOAL_OPENING.y,
      });
      if (result.type === 'save') goalie.setSavePose(true);
      setLastResult(result);
      setResultSubText(subText);
      setResultDisplayKind(displayKind);
      setIsShowingResult(true);
    }, flightMs);

    scheduleShotTimeout(() => {
      loop.endScenePause();
      loop.endShooterPause();
      if (pendingClockRebaseRef.current) {
        pendingClockRebaseRef.current = false;
        loop.rebaseTime(computeInitialPlayClocks(sessionTimingRef.current));
      }
      puck.release();
      if (result.type === 'save') goalie.setSavePose(false);
      setIsShowingResult(false);
      setResultDisplayKind(null);
      shotAnimationInProgressRef.current = false;
      setIsShotInProgress(false);
      const applyPending = pendingMidShotApplyRef.current;
      if (applyPending) {
        applyPending();
        pendingMidShotApplyRef.current = null;
      }
    }, flightMs + PAUSE_MS);

    void submitShot({
      shotIndex,
      input,
      claimedResult: result.type,
    }).then((res) => {
      if (!mountedRef.current) return;
      shotSubmitPendingRef.current = false;
      setIsShotSubmitPending(false);
      if (res === null) return;
      const applyNextState = () => (applyResolvedState ?? applyState)(res.state);
      if (shotAnimationInProgressRef.current) {
        pendingMidShotApplyRef.current = applyNextState;
        return;
      }
      applyNextState();
    });
  }, [optimisticAddShot, submitShot, applyState, applyResolvedState]);

  const handleInactiveAction = useCallback(async (): Promise<void> => {
    if (!inactiveAction || isInactiveActionPending) return;
    setIsInactiveActionPending(true);
    try {
      const loop = loopRef.current;
      const ticker = tickerRef.current;
      if (entranceBeforeInactiveAction && loop && ticker) {
        skipNextUnsuppressedEntranceRef.current = true;
        await startEntranceAnimation(loop, ticker, { attachOnComplete: false, animateGoal: false });
      }
      const result = await inactiveAction();
      if (entranceBeforeInactiveAction && result == null) {
        skipNextUnsuppressedEntranceRef.current = false;
        loop?.detach();
        goalRef.current?.update(scaleRef.current, 0);
        if (playerRef.current) playerRef.current.container.visible = false;
        if (goalieRef.current) goalieRef.current.container.visible = false;
        if (puckRef.current) puckRef.current.container.visible = false;
      }
    } finally {
      setIsInactiveActionPending(false);
    }
  }, [
    entranceBeforeInactiveAction,
    inactiveAction,
    isInactiveActionPending,
    startEntranceAnimation,
  ]);

  const handlePrimaryTap = useCallback((): void => {
    if (primaryActionBlocked) return;
    const cur = sessionRef.current;
    if (!cur.active && inactiveAction) {
      void handleInactiveAction();
      return;
    }
    handleShotTap();
  }, [handleInactiveAction, handleShotTap, inactiveAction, primaryActionBlocked]);

  const timerValue = timer ?? formatMs(remaining);
  const isDuelShotBlocked = active && currentDuelCondition?.canShoot === false;
  const isDuelRestBlocked = isDuelShotBlocked && currentDuelCondition?.status === 'exhausted_stop';
  const effectiveShotButtonLabel = duelPrimaryButtonLabel(shotButtonLabel, currentDuelCondition);
  const duelFatigueNotice = duelFatigueNoticeLabel(currentDuelCondition);
  const showDuelStumbleNotice =
    duelStumbleNoticeVisible && currentDuelCondition?.status !== 'exhausted_stop';
  const primaryButtonDisabled =
    primaryActionBlocked ||
    (suppressedByModal && !inactiveAction) ||
    isInactiveActionPending ||
    isShotInProgress ||
    isShotSubmitPending ||
    isShowingResult ||
    (!active && !inactiveAction) ||
    isDuelShotBlocked ||
    (active &&
      (routeCameraPhase === 'zoomed' || routeCameraPhase === 'exiting' || isEntrancePlaying)) ||
    (active && typeof shotsTotal === 'number' && shots >= shotsTotal);
  const effectiveRinkLayer = rinkLayer ?? (
    <TrainingPerspectiveRink
      design="long"
      longBackground={longCourtBackground}
      scoreboard={
        <GameScoreboard
          {...buildGameScoreboardModel({
            period: periodNumber,
            periodsTotal,
            timer: timerValue,
            timerLabel: timerLabel ?? 'ВРЕМЯ',
            goals: scoreboardGoals ?? goals,
            shots,
            ...(shotsTotal !== undefined ? { shotsTotal } : {}),
            ...(scoreboardNotice !== undefined ? { notice: scoreboardNotice } : {}),
            ...(scoreboardOpponent !== undefined ? { opponent: scoreboardOpponent } : {}),
          })}
        />
      }
    />
  );
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
          display: hideScoreboard ? 'none' : 'grid',
          gap: 8,
          margin: hideScoreboard ? 0 : '12px 14px 10px',
          ...routeChromeStyle,
        }}
      >
        {!hideScoreboard && (
          <ScoreBoard
            period={periodNumber}
            periodsTotal={scoreboardPeriodsTotal ?? periodsTotal}
            timer={timerValue}
            timerLabel={timerLabel}
            goals={scoreboardGoals ?? goals}
            shots={shots}
            shotsTotal={shotsTotal}
            opponent={scoreboardOpponent}
          />
        )}
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
          {effectiveRinkLayer}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              ...gameLayerStyle,
              ...routeGameStyle,
            }}
          >
            <PixiStage
              onReady={handleReady}
              onResize={handleResize}
              preloadAssets={preloadAssets}
            />
          </div>
          {overlayControls && (
            <div
              style={{
                position: 'absolute',
                top: 'clamp(112px, 22%, 148px)',
                left: 'clamp(10px, 3.4%, 18px)',
                zIndex: 7,
                pointerEvents: 'auto',
                ...routeGameStyle,
              }}
            >
              {overlayControls}
            </div>
          )}
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
          {showDuelStumbleNotice ? (
            <div
              role="status"
              aria-live="polite"
              className="duel-stumble-notice"
              style={routeGameStyle}
            >
              Споткнулся
            </div>
          ) : duelFatigueNotice ? (
            <div
              role="status"
              aria-live="polite"
              className={
                currentDuelCondition?.status === 'exhausted_stop'
                  ? 'duel-fatigue-notice duel-rest-notice'
                  : 'duel-fatigue-notice'
              }
              style={routeGameStyle}
            >
              {duelFatigueNotice}
            </div>
          ) : null}
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
          className={isDuelRestBlocked ? 'btn btn--cta btn--duel-blocked' : 'btn btn--cta'}
          onClick={handlePrimaryTap}
          disabled={primaryButtonDisabled}
          style={{
            width: '100%',
            minHeight: 58,
            padding: '0 22px',
            letterSpacing: '0.12em',
            fontSize: 16,
          }}
        >
          {effectiveShotButtonLabel}
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
