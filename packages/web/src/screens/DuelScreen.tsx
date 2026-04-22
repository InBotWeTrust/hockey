import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Container, Graphics } from 'pixi.js';
import type { Application } from 'pixi.js';
import {
  getGoalie,
  resolveShot,
  getSessionPhaseOffsets,
  STICK_NEUTRAL,
  PUCK_SPEED_PER_MS,
  PUCK_START,
  GOAL_OPENING,
  RINK,
  SHOOTER_CENTER_X,
  SHOOTER_AMPLITUDE,
  type ShotResult,
} from '@hockey/game-core';
import { RotateCcw } from 'lucide-react';
import { PixiStage } from '../game/PixiStage.js';
import { Rink } from '../game/renderer/Rink.js';
import { Goal } from '../game/renderer/Goal.js';
import { Goalie } from '../game/renderer/Goalie.js';
import { Puck } from '../game/renderer/Puck.js';
import { Player } from '../game/renderer/Player.js';
import { createGameLoop, type GameLoop, type SpeedOverrides } from '../game/loop.js';
import type { Scale } from '../game/coords.js';
import { useTrainingStore } from '../stores/trainingStore.js';
import { useAuthStore } from '../auth/authStore.js';
import { NAV_HEIGHT } from '../components/BottomNav.js';

const BG = '#f4f7fb';
const PANEL = '#ffffff';
const PANEL_BORDER = '#e2e8f0';
const TEXT = '#0f172a';
const MUTED = '#64748b';
const ACCENT = '#0f172a';

const ROOKIE_ID = 'rookie';
const ROOKIE_CFG = getGoalie(ROOKIE_ID);

const DEFAULT_SPEEDS: SpeedOverrides = {
  goalFreq: ROOKIE_CFG.goalFrequency,
  goalieFreq: ROOKIE_CFG.frequency,
  shooterFreq: 0.45,
  puckSpeed: PUCK_SPEED_PER_MS,
};

function computeShooterX(t: number, freq: number): number {
  const period = 1000 / freq;
  const phase = ((t % period) + period) % period / period;
  const tri = phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4;
  return SHOOTER_CENTER_X + SHOOTER_AMPLITUDE * tri;
}

export function DuelScreen(): JSX.Element {
  const { goalieId: paramGoalieId } = useParams<{ goalieId: string }>();
  const goalieId = paramGoalieId ?? ROOKIE_ID;

  const state = useTrainingStore();
  const scaleRef = useRef<Scale>({ factor: 1, offsetX: 0, offsetY: 0 });
  const loopRef = useRef<GameLoop | null>(null);
  const puckRef = useRef<Puck | null>(null);
  const refreshRef = useRef<((s: Scale) => void) | null>(null);
  const [isShowingResult, setIsShowingResult] = useState(false);
  const isFirstShot = useRef(true);

  const [speeds, setSpeeds] = useState<SpeedOverrides>(DEFAULT_SPEEDS);
  const speedsRef = useRef<SpeedOverrides>(DEFAULT_SPEEDS);
  speedsRef.current = speeds;

  const flightDurationMs = useMemo(
    () => (PUCK_START.y - GOAL_OPENING.y) / speeds.puckSpeed,
    [speeds.puckSpeed],
  );

  useEffect(() => {
    if (isFirstShot.current) { isFirstShot.current = false; return; }
    if (!state.lastResult) return;
    setIsShowingResult(true);
    const t = setTimeout(() => setIsShowingResult(false), 850);
    return () => clearTimeout(t);
  }, [state.shotIndex]);

  useEffect(() => {
    try {
      getGoalie(goalieId);
      useTrainingStore.getState().startDuel(goalieId);
    } catch {
      useTrainingStore.getState().startDuel(ROOKIE_ID);
    }
    return () => useTrainingStore.getState().reset();
  }, [goalieId]);

  const handleReady = useCallback((app: Application, initialScale: Scale): void => {
    scaleRef.current = initialScale;

    const rink = new Rink();
    const goal = new Goal();
    const goalie = new Goalie();
    const grip = useAuthStore.getState().user?.grip ?? 'left';
    const puck = new Puck(grip);
    const player = new Player(grip);
    puckRef.current = puck;

    const rinkMask = new Graphics();
    const gameLayer = new Container();
    gameLayer.addChild(goal.container);
    gameLayer.addChild(goalie.container);
    gameLayer.addChild(player.container);
    gameLayer.addChild(puck.container);
    gameLayer.mask = rinkMask;

    app.stage.addChild(rink.container);
    app.stage.addChild(gameLayer);
    app.stage.addChild(rinkMask);

    const BORDER = 5;
    const RADIUS = 23;

    const refresh = (s: Scale): void => {
      scaleRef.current = s;
      rink.update(s);
      goal.update(s);
      player.update(s);
      puck.resetAtStart(s);
      const f = s.factor;
      rinkMask.clear().roundRect(
        s.offsetX + BORDER * f,
        s.offsetY + BORDER * f,
        RINK.width * f - 2 * BORDER * f,
        RINK.height * f - 2 * BORDER * f,
        RADIUS * f,
      ).fill(0xffffff);
    };
    refreshRef.current = refresh;
    refresh(initialScale);

    const loop = createGameLoop({
      goalRenderer: goal,
      goalieRenderer: goalie,
      playerRenderer: player,
      puckRenderer: puck,
      getScale: () => scaleRef.current,
      getSeed: () => useTrainingStore.getState().seed,
      getShotIndex: () => useTrainingStore.getState().shotIndex,
      getGoalieId: () => useTrainingStore.getState().currentGoalieId,
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
    if (!loop || !puck) return;
    const st = useTrainingStore.getState();
    if (!st.currentGoalieId || puck.isFlying()) return;

    const cfg = getGoalie(st.currentGoalieId);
    const overrides = speedsRef.current;
    const activeCfg = { ...cfg, goalFrequency: overrides.goalFreq, frequency: overrides.goalieFreq };

    const tapTime = performance.now() - loop.sessionStartMs;
    const offsets = getSessionPhaseOffsets(st.seed);
    const sx = computeShooterX(tapTime + offsets.shooter, overrides.shooterFreq);
    const result: ShotResult = resolveShot(
      { tapTime, puckSpeedPerMs: overrides.puckSpeed },
      activeCfg,
      st.seed,
      st.shotIndex,
      STICK_NEUTRAL,
      offsets,
    );

    puck.playShot(
      puck.bladePoint(sx),
      { x: sx, y: GOAL_OPENING.y },
      performance.now(),
      flightDurationMs,
    );
    window.setTimeout(() => {
      useTrainingStore.getState().applyResult(result);
      const o = getSessionPhaseOffsets(useTrainingStore.getState().seed);
      puck.resetAtStart(scaleRef.current, computeShooterX(
        performance.now() - loop.sessionStartMs + o.shooter,
        speedsRef.current.shooterFreq,
      ));
    }, flightDurationMs + 20);
  }, [flightDurationMs]);

  const cfg = state.currentGoalieId ? getGoalie(state.currentGoalieId) : null;
  const shotDisabled = !cfg || isShowingResult;

  return (
    <main
      style={{
        position: 'fixed',
        top: 'env(safe-area-inset-top, 0px)',
        left: 0,
        right: 0,
        bottom: `calc(${NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px) / 2)`,
        display: 'flex',
        flexDirection: 'column',
        background: BG,
        color: TEXT,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Speed controls */}
      <div
        style={{
          padding: '10px 16px 6px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 6,
        }}
      >
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

      {/* Rink */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          margin: '0 12px 12px',
          borderRadius: 20,
          overflow: 'hidden',
          border: `1px solid ${PANEL_BORDER}`,
          background: '#eaf2fb',
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
        }}
      >
        <PixiStage onReady={handleReady} onResize={handleResize} />
      </div>

      {/* Shot button — 50% width, centered */}
      <div style={{ padding: '0 16px 16px', display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={handleShotTap}
          disabled={shotDisabled}
          style={{
            width: '50%',
            height: 60,
            borderRadius: 16,
            border: 'none',
            background: shotDisabled ? '#cbd5e1' : ACCENT,
            color: '#ffffff',
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 2,
            textTransform: 'uppercase',
            cursor: shotDisabled ? 'not-allowed' : 'pointer',
            boxShadow: shotDisabled ? 'none' : '0 4px 16px rgba(0,0,0,0.25)',
            touchAction: 'manipulation',
          }}
        >
          Бросок
        </button>
      </div>

      {/* Result flash */}
      {isShowingResult && state.lastResult && (
        <>
          <style>{`
            @keyframes result-pop {
              0%  { transform: translate(-50%, -50%) scale(0.55); opacity: 0; }
              60% { transform: translate(-50%, -50%) scale(1.08); opacity: 1; }
              100%{ transform: translate(-50%, -50%) scale(1);    opacity: 1; }
            }
          `}</style>
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              zIndex: 300,
              animation: 'result-pop 0.22s cubic-bezier(.22,.68,0,1.4) forwards',
              pointerEvents: 'none',
              textAlign: 'center',
              background: state.lastResult.type === 'goal'
                ? 'rgba(34,197,94,0.95)'
                : state.lastResult.type === 'save'
                  ? 'rgba(30,64,175,0.95)'
                  : 'rgba(226,54,54,0.95)',
              borderRadius: 24,
              padding: '20px 52px',
              boxShadow: '0 12px 60px rgba(0,0,0,0.55)',
            }}
          >
            <div style={{
              fontSize: 72,
              fontWeight: 900,
              letterSpacing: 4,
              color: '#ffffff',
              textTransform: 'uppercase',
              lineHeight: 1,
            }}>
              {state.lastResult.type === 'goal' && 'ТОЧНО'}
              {state.lastResult.type === 'save' && 'СЭЙВ'}
              {state.lastResult.type === 'miss' && 'МИМО'}
            </div>
          </div>
        </>
      )}
    </main>
  );
}

interface SpeedInputProps {
  label: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  onReset: () => void;
}

function SpeedInput({ label, value, defaultValue, min, max, step, onChange, onReset }: SpeedInputProps): JSX.Element {
  const isDefault = Math.abs(value - defaultValue) < step / 2;
  return (
    <div
      style={{
        background: PANEL,
        border: `1px solid ${PANEL_BORDER}`,
        borderRadius: 12,
        padding: '6px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, letterSpacing: 0.8, color: MUTED, textTransform: 'uppercase' }}>
          {label}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>
            {value.toFixed(2)}
          </span>
          <button
            onClick={onReset}
            disabled={isDefault}
            style={{
              background: 'none',
              border: 'none',
              padding: 2,
              cursor: isDefault ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              opacity: isDefault ? 0.2 : 0.6,
              transition: 'opacity 0.15s',
            }}
          >
            <RotateCcw size={11} color={TEXT} />
          </button>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: ACCENT, cursor: 'pointer' }}
      />
    </div>
  );
}
