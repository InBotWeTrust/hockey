import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Container } from 'pixi.js';
import type { Application } from 'pixi.js';
import {
  GAME_CORE_VERSION,
  PUCK_START,
  GOAL_OPENING,
  GOALIE_Y,
  SHOOTER_AMPLITUDE,
  SHOOTER_CENTER_X,
  STICK_NEUTRAL,
  deriveShotSeed,
  getGoalie,
  getSessionPhaseOffsets,
  resolveShot,
  type ShotResult,
} from '@hockey/game-core';
import { PixiStage } from '../game/PixiStage.js';
import { RinkSvg } from '../game/RinkSvg.js';
import { Goal } from '../game/renderer/Goal.js';
import { Goalie } from '../game/renderer/Goalie.js';
import { Hitboxes } from '../game/renderer/Hitboxes.js';
import { Player } from '../game/renderer/Player.js';
import { Puck } from '../game/renderer/Puck.js';
import { createGameLoop, type GameLoop, type SpeedOverrides } from '../game/loop.js';
import type { Scale } from '../game/coords.js';
import { useAuthStore } from '../auth/authStore.js';
import { useDailyStore } from '../stores/dailyStore.js';
import { ScoreBoard } from '../components/ScoreBoard.js';
import { ResultModal } from '../components/ResultModal.js';
import { GAME_CORE_VERSION as _v } from '@hockey/game-core';

void _v;

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

export function DailyScreen(): JSX.Element {
  const { data, refresh } = useDailyStore();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!data) {
    return (
      <main className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--muted)' }}>Загрузка…</div>
      </main>
    );
  }

  if (data.state === 'period_active') return <PlayView />;
  if (data.state === 'break_active') return <BreakView />;
  if (data.state === 'closed') return <ClosedView />;
  return <IdleView />;
}

function StatsHeader(): JSX.Element {
  const data = useDailyStore((s) => s.data);
  if (!data) return <></>;
  const acc =
    data.lifetime_total_shots > 0
      ? Math.round((data.lifetime_total_goals / data.lifetime_total_shots) * 100)
      : 0;
  return (
    <div
      className="glass"
      style={{
        margin: '12px 14px',
        padding: '10px 14px',
        borderRadius: 14,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
        textAlign: 'center',
        fontSize: 12,
      }}
    >
      <div>
        <div style={{ color: 'var(--muted)', fontSize: 10, letterSpacing: 0.6 }}>ЗА ВСЁ ВРЕМЯ</div>
        <div style={{ fontWeight: 700 }}>{data.lifetime_total_goals} голов</div>
      </div>
      <div>
        <div style={{ color: 'var(--muted)', fontSize: 10, letterSpacing: 0.6 }}>БРОСКИ</div>
        <div style={{ fontWeight: 700 }}>{data.lifetime_total_shots}</div>
      </div>
      <div>
        <div style={{ color: 'var(--muted)', fontSize: 10, letterSpacing: 0.6 }}>ТОЧНОСТЬ</div>
        <div style={{ fontWeight: 700 }}>{acc}%</div>
      </div>
    </div>
  );
}

function IdleView(): JSX.Element {
  const data = useDailyStore((s) => s.data)!;
  const startPeriod = useDailyStore((s) => s.startPeriod);
  const inFlight = useDailyStore((s) => s.inFlight);

  const nextPeriod = data.current_period === 0 ? 1 : data.current_period + 1;
  const allDone = nextPeriod > data.total_periods;
  const label = data.current_period === 0 ? 'Готов к игре' : 'Перерыв окончен';

  return (
    <main className="screen" style={{ display: 'flex', flexDirection: 'column' }}>
      <StatsHeader />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 18 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>{label}</h1>
        {allDone ? (
          <div style={{ color: 'var(--muted)' }}>Дневная игра завершена.</div>
        ) : (
          <>
            <div style={{ color: 'var(--muted)', textAlign: 'center', maxWidth: 280 }}>
              Период {nextPeriod} из {data.total_periods}. У тебя 20 минут на {data.shots_per_period} бросков.
            </div>
            <button
              type="button"
              className="btn btn--cta"
              onClick={() => void startPeriod()}
              disabled={inFlight}
              style={{ minWidth: 240 }}
            >
              Начать {nextPeriod}-й период
            </button>
          </>
        )}
        <div style={{ color: 'var(--muted)', fontSize: 12 }}>
          За день: {data.daily_total_goals} голов из {data.daily_total_shots} бросков
        </div>
      </div>
    </main>
  );
}

function BreakView(): JSX.Element {
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
    if (remaining === 0) void refresh();
  }, [remaining, refresh]);

  return (
    <main className="screen" style={{ display: 'flex', flexDirection: 'column' }}>
      <StatsHeader />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 18 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Перерыв</h1>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 56, fontWeight: 700, letterSpacing: '0.06em' }}>
          {formatMs(remaining)}
        </div>
        <div style={{ color: 'var(--muted)' }}>До {data.current_period + 1}-го периода</div>
      </div>
    </main>
  );
}

function ClosedView(): JSX.Element {
  const data = useDailyStore((s) => s.data)!;
  const acc =
    data.daily_total_shots > 0
      ? Math.round((data.daily_total_goals / data.daily_total_shots) * 100)
      : 0;
  return (
    <main className="screen" style={{ display: 'flex', flexDirection: 'column' }}>
      <StatsHeader />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 18 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Игровой день окончен</h1>
        <div style={{ color: 'var(--muted)' }}>Возвращайся завтра.</div>
        <div className="glass" style={{ padding: '12px 18px', borderRadius: 14, display: 'flex', gap: 18 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: 'var(--muted)', fontSize: 10, letterSpacing: 0.6 }}>ГОЛОВ</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{data.daily_total_goals}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: 'var(--muted)', fontSize: 10, letterSpacing: 0.6 }}>БРОСКОВ</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{data.daily_total_shots}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: 'var(--muted)', fontSize: 10, letterSpacing: 0.6 }}>%</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{acc}</div>
          </div>
        </div>
      </div>
    </main>
  );
}

function PlayView(): JSX.Element {
  const dataRef = useRef(useDailyStore.getState().data!);
  // Subscribe so re-renders happen on counter updates.
  const data = useDailyStore((s) => s.data)!;
  dataRef.current = data;
  const optimisticAddShot = useDailyStore((s) => s.optimisticAddShot);
  const submitShot = useDailyStore((s) => s.submitShot);
  const refresh = useDailyStore((s) => s.refresh);

  const scaleRef = useRef<Scale>({ factor: 1, offsetX: 0, offsetY: 0 });
  const loopRef = useRef<GameLoop | null>(null);
  const puckRef = useRef<Puck | null>(null);
  const playerRef = useRef<Player | null>(null);
  const goalRef = useRef<Goal | null>(null);
  const goalieRef = useRef<Goalie | null>(null);
  const hitboxesRef = useRef<Hitboxes | null>(null);
  const refreshRef = useRef<((s: Scale) => void) | null>(null);
  const [isShowingResult, setIsShowingResult] = useState(false);
  const [resultSubText, setResultSubText] = useState<string | null>(null);

  const speeds = DEFAULT_SPEEDS;
  const speedsRef = useRef<SpeedOverrides>(DEFAULT_SPEEDS);

  const flightDurationMs = useMemo(
    () => (PUCK_START.y - GOAL_OPENING.y) / speeds.puckSpeed,
    [speeds.puckSpeed],
  );

  // Local timer for period_ends_at countdown
  const periodEndsAt = data.period_ends_at ? new Date(data.period_ends_at).getTime() : 0;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);
  const remaining = Math.max(0, periodEndsAt - now);

  // When timer hits 0 — refresh from server (it'll move us into break_active).
  useEffect(() => {
    if (remaining === 0 && periodEndsAt > 0) void refresh();
  }, [remaining, periodEndsAt, refresh]);

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

    const layer = new Container();
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
    loop.attach(app.ticker);
    loopRef.current = loop;
  }, []);

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
    const goalieCfg = getGoalie(cur.goalie_id);
    const overrides = speedsRef.current;
    const activeCfg = {
      ...goalieCfg,
      goalFrequency: overrides.goalFreq,
      frequency: overrides.goalieFreq,
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
    };
    const result: ShotResult = resolveShot(
      input,
      activeCfg,
      seed,
      shotIndex,
      STICK_NEUTRAL,
      offsets,
    );

    optimisticAddShot(result.type);

    loop.beginShooterPause();
    playerRef.current?.playShot();
    puck.playShot(
      puck.bladePoint(sx),
      { x: sx, y: GOAL_OPENING.y },
      performance.now(),
      flightDurationMs,
    );

    window.setTimeout(() => {
      loop.beginScenePause();
      puck.holdAt({ x: sx, y: result.type === 'save' ? GOAL_OPENING.y + 20 : GOAL_OPENING.y });
      if (result.type === 'save') goalie.setSavePose(true);
      if (result.type === 'goal') goalRef.current?.triggerGoalLight();
      setResultSubText(null);
      setIsShowingResult(true);
    }, flightDurationMs);

    window.setTimeout(() => {
      loop.endScenePause();
      loop.endShooterPause();
      puck.release();
      if (result.type === 'save') goalie.setSavePose(false);
      setIsShowingResult(false);
    }, flightDurationMs + PAUSE_MS);

    void submitShot({
      shotIndex,
      input,
      claimedResult: result.type,
    });

    void GAME_CORE_VERSION; // keeps import non-tree-shaken
    void GOALIE_Y;
  }, [flightDurationMs, optimisticAddShot, submitShot]);

  const periodNum = data.current_period > 0 ? data.current_period : 1;
  const lastResult = useMemo<ShotResult | null>(() => null, []);

  return (
    <main
      className="screen"
      style={{
        position: 'fixed',
        top: 'env(safe-area-inset-top, 0px)',
        left: 0,
        right: 0,
        bottom: `calc(76px + env(safe-area-inset-bottom, 0px) / 2)`,
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
        </div>
      </div>

      <div style={{ padding: '0 14px 10px', display: 'flex', justifyContent: 'center' }}>
        <button
          type="button"
          className="btn btn--cta"
          onClick={handleShotTap}
          disabled={isShowingResult || data.current_period_shots >= data.shots_per_period}
          style={{ width: '100%' }}
        >
          БРОСОК
        </button>
      </div>

      {isShowingResult && lastResult && (
        <ResultModal result={lastResult} durationMs={PAUSE_MS} subText={resultSubText} />
      )}
    </main>
  );
}
