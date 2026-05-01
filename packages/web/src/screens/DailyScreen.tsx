import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Container } from 'pixi.js';
import type { Application, Ticker } from 'pixi.js';
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
  getGoalie,
  getSessionPhaseOffsets,
  resolveShot,
  simulateGoal,
  simulateGoalie,
  type ShotResult,
} from '@hockey/game-core';
import { Settings } from 'lucide-react';
import { PixiStage } from '../game/PixiStage.js';
import { RinkSvg } from '../game/RinkSvg.js';
import { Goal } from '../game/renderer/Goal.js';
import { Goalie } from '../game/renderer/Goalie.js';
import { Hitboxes } from '../game/renderer/Hitboxes.js';
import { IceCar, iceCarPosAt } from '../game/renderer/IceCar.js';
import { Player } from '../game/renderer/Player.js';
import { Puck } from '../game/renderer/Puck.js';
import { createGameLoop, type GameLoop, type SpeedOverrides } from '../game/loop.js';
import type { Scale } from '../game/coords.js';
import { useAuthStore } from '../auth/authStore.js';
import { useDailyStore } from '../stores/dailyStore.js';
import { ScoreBoard } from '../components/ScoreBoard.js';
import { ResultModal } from '../components/ResultModal.js';
import { SettingsSheet } from '../components/SettingsSheet.js';
import { SpeedInput } from '../components/SpeedInput.js';
import { StartPeriodModal } from '../components/StartPeriodModal.js';
import type { DailyStateResponse, PeriodLogEntry } from '../api/duel.js';

const DEFAULT_SPEEDS: SpeedOverrides = {
  goalFreq: 0.55,
  goalieFreq: 0.65,
  shooterFreq: 0.8,
  puckSpeed: 1.3,
};

const PAUSE_MS = 1000;

function computeShooterX(t: number, freq: number): number {
  const period = 1000 / freq;
  const phase = (((t % period) + period) % period) / period;
  const tri = phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4;
  return SHOOTER_CENTER_X + SHOOTER_AMPLITUDE * tri;
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

export function DailyScreen(): JSX.Element {
  const data = useDailyStore((s) => s.data);
  const deferredState = useDailyStore((s) => s.deferredState);
  const error = useDailyStore((s) => s.error);
  const loading = useDailyStore((s) => s.loading);
  const refresh = useDailyStore((s) => s.refresh);
  const applyDeferredState = useDailyStore((s) => s.applyDeferredState);
  const userId = useAuthStore((s) => s.user?.id ?? '');

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Period stats render inline on the BreakOverlay / ClosedOverlay via accordion.
  void deferredState;
  void applyDeferredState;
  void userId;

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

  const showStartModal = data.state === 'idle' && data.current_period < data.total_periods;

  const isPlaying = data.state === 'period_active';

  // PlayView (rink) is the always-on background so any modal/overlay shows
  // the rink with goal centred and players hidden — never an empty gradient.
  return (
    <>
      <PlayView suppressedByModal={!isPlaying} />
      {data.state === 'break_active' && <BreakOverlay />}
      {data.state === 'closed' && <ClosedOverlay />}
      {showStartModal && <StartPeriodModalConnector />}
    </>
  );
}

function ModalBackdrop({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 350,
        background: 'rgba(15, 23, 42, 0.18)',
        backdropFilter: 'blur(6px) saturate(130%)',
        WebkitBackdropFilter: 'blur(6px) saturate(130%)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: 'calc(50dvh - 200px) 20px 20px',
        overflowY: 'auto',
      }}
    >
      {children}
    </div>
  );
}

function StartPeriodModalConnector(): JSX.Element {
  const data = useDailyStore((s) => s.data)!;
  const startPeriod = useDailyStore((s) => s.startPeriod);
  const pending = useDailyStore((s) => s.inFlight);
  const nextPeriod = data.current_period === 0 ? 1 : data.current_period + 1;
  return (
    <StartPeriodModal
      nextPeriod={nextPeriod}
      totalPeriods={data.total_periods}
      shotsPerPeriod={data.shots_per_period}
      isFirstPeriod={data.current_period === 0}
      pending={pending}
      onStart={() => void startPeriod()}
    />
  );
}

function DailyTotalsRow(): JSX.Element {
  const data = useDailyStore((s) => s.data)!;
  const acc =
    data.daily_total_shots > 0
      ? Math.round((data.daily_total_goals / data.daily_total_shots) * 100)
      : 0;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
        width: '100%',
        maxWidth: 320,
      }}
    >
      <TotalCell label="ГОЛЫ" value={String(data.daily_total_goals)} />
      <TotalCell label="БРОСКИ" value={String(data.daily_total_shots)} />
      <TotalCell label="ТОЧНОСТЬ" value={`${acc}%`} />
    </div>
  );
}

function TotalCell({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div
      style={{
        padding: '10px 6px',
        borderRadius: 14,
        background:
          'linear-gradient(180deg, rgba(255, 255, 255, 0.7) 0%, rgba(226, 232, 240, 0.55) 100%)',
        border: '1px solid rgba(15, 23, 42, 0.06)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.95)',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 9, letterSpacing: '0.18em', fontWeight: 700, color: 'var(--muted)' }}>
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: 18,
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

function PeriodAccordion({ periods }: { periods: PeriodLogEntry[] }): JSX.Element | null {
  const [openPeriod, setOpenPeriod] = useState<number | null>(null);
  if (periods.length === 0) return null;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: 'stretch',
        width: '100%',
        maxWidth: 320,
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: '0.22em',
          fontWeight: 700,
          color: 'var(--muted)',
          textTransform: 'uppercase',
          textAlign: 'center',
        }}
      >
        Статистика
      </div>
      {periods.map((p) => {
        const isOpen = openPeriod === p.period_number;
        const accuracy = p.shots_taken > 0 ? Math.round((p.goals / p.shots_taken) * 100) : 0;
        return (
          <div key={p.period_number} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              className="btn btn--ghost"
              aria-expanded={isOpen}
              onClick={() => setOpenPeriod(isOpen ? null : p.period_number)}
              style={{ paddingBlock: 12, width: '100%' }}
            >
              {p.period_number}-й период
            </button>
            {isOpen && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 8,
                }}
              >
                <PeriodStatCell label="ГОЛЫ" value={String(p.goals)} />
                <PeriodStatCell label="БРОСКИ" value={String(p.shots_taken)} />
                <PeriodStatCell label="ТОЧНОСТЬ" value={`${accuracy}%`} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PeriodStatCell({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div
      style={{
        padding: '10px 6px',
        borderRadius: 14,
        background: 'rgba(255, 255, 255, 0.55)',
        border: '1px solid rgba(15, 23, 42, 0.06)',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: 9,
          letterSpacing: '0.18em',
          fontWeight: 700,
          color: 'var(--muted)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 22,
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

function BreakOverlay(): JSX.Element {
  const data = useDailyStore((s) => s.data)!;
  const refresh = useDailyStore((s) => s.refresh);
  const breakEndsAt = data.break_ends_at ? new Date(data.break_ends_at).getTime() : 0;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const remaining = Math.max(0, breakEndsAt - now);
  useEffect(() => {
    if (remaining === 0 && breakEndsAt > 0) void refresh();
  }, [remaining, breakEndsAt, refresh]);

  return (
    <ModalBackdrop>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          textAlign: 'center',
          width: '100%',
        }}
      >
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Перерыв</h1>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 56,
            fontWeight: 700,
            letterSpacing: '0.06em',
          }}
        >
          {formatMs(remaining)}
        </div>
        <div style={{ color: 'var(--muted)' }}>До начала {data.current_period + 1}-го периода</div>
        <DailyTotalsRow />
        <PeriodAccordion periods={data.recent_periods} />
      </div>
    </ModalBackdrop>
  );
}

function ClosedOverlay(): JSX.Element {
  const data = useDailyStore((s) => s.data)!;
  const refresh = useDailyStore((s) => s.refresh);
  const nextDayAt = new Date(data.next_day_starts_at).getTime();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const remaining = Math.max(0, nextDayAt - now);
  useEffect(() => {
    if (remaining === 0 && nextDayAt > 0) void refresh();
  }, [remaining, nextDayAt, refresh]);

  return (
    <ModalBackdrop>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          textAlign: 'center',
          width: '100%',
        }}
      >
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Игровой день окончен</h1>
        <div style={{ color: 'var(--muted)' }}>До нового дня</div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: '0.06em',
          }}
        >
          {formatHms(remaining)}
        </div>
        <DailyTotalsRow />
        <PeriodAccordion periods={data.recent_periods} />
      </div>
    </ModalBackdrop>
  );
}

interface PlayViewProps {
  suppressedByModal: boolean;
}

function PlayView({ suppressedByModal }: PlayViewProps): JSX.Element {
  const data = useDailyStore((s) => s.data)!;
  const dataRef = useRef(data);
  dataRef.current = data;
  const optimisticAddShot = useDailyStore((s) => s.optimisticAddShot);
  const submitShot = useDailyStore((s) => s.submitShot);
  const refresh = useDailyStore((s) => s.refresh);
  const applyState = useDailyStore((s) => s.applyState);

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
  const [resultSubText, setResultSubText] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ShotResult | null>(null);
  const [showHitboxes, setShowHitboxes] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Server state is held until shot animation ends, so ScoreBoard counters
  // don't jump while the puck is still flying.
  const pendingMidShotStateRef = useRef<DailyStateResponse | null>(null);
  const [pixiReady, setPixiReady] = useState(false);
  // Ref-mirror of suppressedByModal so handleReady (initialized once via
  // useCallback) can read the latest value when Pixi finishes loading.
  const suppressedRef = useRef(suppressedByModal);
  suppressedRef.current = suppressedByModal;

  const [speeds, setSpeeds] = useState<SpeedOverrides>(DEFAULT_SPEEDS);
  const speedsRef = useRef<SpeedOverrides>(DEFAULT_SPEEDS);
  speedsRef.current = speeds;

  const flightDurationMs = useMemo(
    () => (PUCK_START.y - GOAL_OPENING.y) / speeds.puckSpeed,
    [speeds.puckSpeed],
  );

  const periodEndsAt = data.period_ends_at ? new Date(data.period_ends_at).getTime() : 0;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);
  const remaining = Math.max(0, periodEndsAt - now);

  useEffect(() => {
    if (remaining === 0 && periodEndsAt > 0) void refresh();
  }, [remaining, periodEndsAt, refresh]);

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

    const goal = new Goal();
    const goalie = new Goalie();
    const hitboxes = new Hitboxes();
    const grip = useAuthStore.getState().user?.grip ?? 'left';
    const puck = new Puck(grip);
    const player = new Player(grip);
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
      getSeed: () => dataRef.current.daily_seed ?? 'fallback',
      getShotIndex: () => dataRef.current.current_period_shots + 1,
      getGoalieId: () => dataRef.current.goalie_id,
      getSpeedOverrides: () => speedsRef.current,
    });
    tickerRef.current = app.ticker;
    loopRef.current = loop;

    const startIceCarLoop = (): void => {
      let t0 = -1;
      const carStep = (rafTime: number): void => {
        if (!mountedRef.current) return;
        if (t0 < 0) t0 = rafTime;
        const pos = iceCarPosAt(rafTime - t0);
        iceCarRef.current?.update(scaleRef.current, pos.x, pos.y, pos.rot);
        iceCarRafRef.current = requestAnimationFrame(carStep);
      };
      iceCarRafRef.current = requestAnimationFrame(carStep);
    };

    // Decide initial visibility/loop state synchronously, BEFORE the first
    // ticker frame, so a modal-on-top mount never flashes moving sprites.
    if (suppressedRef.current) {
      player.container.visible = false;
      goalie.container.visible = false;
      puck.container.visible = false;
      goal.update(initialScale, 0);
      iceCar.container.visible = true;
      startIceCarLoop();
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
      if (iceCarRafRef.current === null) {
        const iceCar = iceCarRef.current;
        if (iceCar) {
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
      }
      return;
    }

    if (iceCarRafRef.current !== null) {
      cancelAnimationFrame(iceCarRafRef.current);
      iceCarRafRef.current = null;
    }
    if (iceCarRef.current) iceCarRef.current.container.visible = false;

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
  }, [suppressedByModal, pixiReady]);

  const handleResize = useCallback((s: Scale): void => {
    refreshRef.current?.(s);
  }, []);

  const handleShotTap = useCallback((): void => {
    const loop = loopRef.current;
    const puck = puckRef.current;
    const goalie = goalieRef.current;
    const cur = dataRef.current;
    if (!loop || !puck || !goalie) return;
    if (puck.isFlying() || puck.isHeld()) return;
    if (cur.state !== 'period_active') return;
    if (!cur.daily_seed) return;
    if (cur.current_period_shots >= cur.shots_per_period) return;

    const shotIndex = cur.current_period_shots + 1;
    const isLastShotOfPeriod = shotIndex === cur.shots_per_period;
    const goalieCfg = getGoalie(cur.goalie_id);
    const overrides = speedsRef.current;
    // Apply the same frequency overrides that resolveShot uses internally, so
    // subText simulateGoal/simulateGoalie calls see the same goal/goalie
    // positions as the resolver did.
    const activeCfg = {
      ...goalieCfg,
      frequency: overrides.goalieFreq,
      goalFrequency: overrides.goalFreq,
    };
    const seed = deriveShotSeed(cur.daily_seed, cur.current_period, shotIndex);
    const offsets = getSessionPhaseOffsets(cur.daily_seed);

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
    const result: ShotResult = resolveShot(
      input,
      activeCfg,
      seed,
      shotIndex,
      STICK_NEUTRAL,
      offsets,
    );

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
    pendingMidShotStateRef.current = null;
    void isLastShotOfPeriod;

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
      const mid = pendingMidShotStateRef.current;
      if (mid) {
        applyState(mid);
        pendingMidShotStateRef.current = null;
      }
    }, flightDurationMs + PAUSE_MS);

    void submitShot({
      shotIndex,
      input,
      claimedResult: result.type,
    }).then((res) => {
      if (!mountedRef.current) return;
      if (res === null) return;
      pendingMidShotStateRef.current = res.state;
    });
  }, [flightDurationMs, optimisticAddShot, submitShot, applyState, refresh]);

  useEffect(() => {
    hitboxesRef.current?.setVisible(showHitboxes);
  }, [showHitboxes, pixiReady]);

  const periodNum = data.current_period > 0 ? data.current_period : 1;

  return (
    <main
      className="screen"
      style={{
        position: 'fixed',
        top: 'calc(var(--app-safe-top) + 6px)',
        left: 0,
        right: 0,
        bottom: 'calc(76px + var(--app-safe-bottom))',
        minHeight: 0,
      }}
    >
      <div style={{ margin: '12px 14px 10px' }}>
        <ScoreBoard
          period={periodNum}
          timer={formatMs(remaining)}
          goals={data.current_period_goals}
          shots={data.current_period_shots}
          shotsTotal={data.shots_per_period}
        />
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
            aspectRatio: '572 / 700',
            width: '100%',
            maxHeight: '100%',
            borderRadius: 64,
            overflow: 'hidden',
            border: '3px solid #1e3a5f',
            background: '#EAF1F8',
          }}
        >
          <RinkSvg />
          <div style={{ position: 'absolute', inset: 0 }}>
            <PixiStage onReady={handleReady} onResize={handleResize} />
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Настройки скоростей"
            title="Настройки скоростей"
            style={{
              position: 'absolute',
              bottom: 18,
              right: 18,
              width: 34,
              height: 34,
              borderRadius: 999,
              border: '1px solid rgba(255, 255, 255, 0.72)',
              background: 'rgba(255, 255, 255, 0.72)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.16)',
              color: 'var(--ink)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0,
              zIndex: 3,
            }}
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      <div style={{ padding: '0 14px 10px', display: 'flex', justifyContent: 'center' }}>
        <button
          type="button"
          className="btn btn--cta"
          onClick={handleShotTap}
          disabled={
            suppressedByModal ||
            isShotInProgress ||
            isShowingResult ||
            data.current_period_shots >= data.shots_per_period
          }
          style={{ width: '100%', paddingBlock: 20 }}
        >
          БРОСОК
        </button>
      </div>

      {isShowingResult && lastResult && (
        <ResultModal result={lastResult} durationMs={PAUSE_MS} subText={resultSubText} />
      )}

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, marginBottom: 14 }}>
          <SpeedInput
            label="Ворота"
            value={speeds.goalFreq}
            defaultValue={DEFAULT_SPEEDS.goalFreq}
            min={0.05}
            max={2.0}
            step={0.05}
            onChange={(v) => setSpeeds((s) => ({ ...s, goalFreq: v }))}
            onReset={() => setSpeeds((s) => ({ ...s, goalFreq: DEFAULT_SPEEDS.goalFreq }))}
          />
          <SpeedInput
            label="Вратарь"
            value={speeds.goalieFreq}
            defaultValue={DEFAULT_SPEEDS.goalieFreq}
            min={0.05}
            max={2.0}
            step={0.05}
            onChange={(v) => setSpeeds((s) => ({ ...s, goalieFreq: v }))}
            onReset={() => setSpeeds((s) => ({ ...s, goalieFreq: DEFAULT_SPEEDS.goalieFreq }))}
          />
          <SpeedInput
            label="Хоккеист"
            value={speeds.shooterFreq}
            defaultValue={DEFAULT_SPEEDS.shooterFreq}
            min={0.05}
            max={2.0}
            step={0.05}
            onChange={(v) => setSpeeds((s) => ({ ...s, shooterFreq: v }))}
            onReset={() => setSpeeds((s) => ({ ...s, shooterFreq: DEFAULT_SPEEDS.shooterFreq }))}
          />
          <SpeedInput
            label="Шайба"
            value={speeds.puckSpeed}
            defaultValue={DEFAULT_SPEEDS.puckSpeed}
            min={0.3}
            max={3.0}
            step={0.1}
            onChange={(v) => setSpeeds((s) => ({ ...s, puckSpeed: v }))}
            onReset={() => setSpeeds((s) => ({ ...s, puckSpeed: DEFAULT_SPEEDS.puckSpeed }))}
          />
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            color: 'var(--muted)',
            cursor: 'pointer',
            padding: '4px 2px',
          }}
        >
          <input
            type="checkbox"
            checked={showHitboxes}
            onChange={(e) => setShowHitboxes(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          Показать хитбоксы
        </label>
      </SettingsSheet>
    </main>
  );
}
