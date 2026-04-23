import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Container } from 'pixi.js';
import type { Application } from 'pixi.js';
import {
  getGoalie,
  resolveShot,
  getSessionPhaseOffsets,
  STICK_NEUTRAL,
  PUCK_START,
  GOAL_OPENING,
  SHOOTER_CENTER_X,
  SHOOTER_AMPLITUDE,
  type ShotResult,
} from '@hockey/game-core';
import { RotateCcw } from 'lucide-react';
import { PixiStage } from '../game/PixiStage.js';
import { Rink } from '../game/renderer/Rink.js';
import { Goal } from '../game/renderer/Goal.js';
import { Goalie } from '../game/renderer/Goalie.js';
import { Hitboxes } from '../game/renderer/Hitboxes.js';
import { Puck } from '../game/renderer/Puck.js';
import { Player } from '../game/renderer/Player.js';
import { createGameLoop, type GameLoop, type SpeedOverrides } from '../game/loop.js';
import type { Scale } from '../game/coords.js';
import { useTrainingStore } from '../stores/trainingStore.js';
import { useAuthStore } from '../auth/authStore.js';
import { NAV_HEIGHT } from '../components/BottomNav.js';
import { ResultModal } from '../components/ResultModal.js';

const BG = '#f4f7fb';
const PANEL = '#ffffff';
const PANEL_BORDER = '#e2e8f0';
const TEXT = '#0f172a';
const MUTED = '#64748b';
const ACCENT = '#0f172a';

const ROOKIE_ID = 'rookie';
const PAUSE_MS = 1000;

const DEFAULT_SPEEDS: SpeedOverrides = {
  goalFreq: 0.55,
  goalieFreq: 0.65,
  shooterFreq: 0.80,
  puckSpeed: 1.30,
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
  const playerRef = useRef<Player | null>(null);
  const goalRef = useRef<Goal | null>(null);
  const goalieRef = useRef<Goalie | null>(null);
  const hitboxesRef = useRef<Hitboxes | null>(null);
  const refreshRef = useRef<((s: Scale) => void) | null>(null);
  const [isShowingResult, setIsShowingResult] = useState(false);
  const [showHitboxes, setShowHitboxes] = useState(false);

  const [speeds, setSpeeds] = useState<SpeedOverrides>(DEFAULT_SPEEDS);
  const speedsRef = useRef<SpeedOverrides>(DEFAULT_SPEEDS);
  speedsRef.current = speeds;

  const flightDurationMs = useMemo(
    () => (PUCK_START.y - GOAL_OPENING.y) / speeds.puckSpeed,
    [speeds.puckSpeed],
  );

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
    const hitboxes = new Hitboxes();
    const grip = useAuthStore.getState().user?.grip ?? 'left';
    const puck = new Puck(grip);
    const player = new Player(grip);
    puckRef.current = puck;
    playerRef.current = player;
    goalRef.current = goal;
    goalieRef.current = goalie;
    hitboxesRef.current = hitboxes;

    const gameLayer = new Container();
    gameLayer.addChild(goal.container);
    gameLayer.addChild(goalie.container);
    gameLayer.addChild(player.container);
    gameLayer.addChild(puck.container);
    gameLayer.addChild(hitboxes.container);

    app.stage.addChild(rink.container);
    app.stage.addChild(gameLayer);

    const refresh = (s: Scale): void => {
      scaleRef.current = s;
      rink.update(s);
      goal.update(s);
      player.update(s);
      puck.resetAtStart(s);
    };
    refreshRef.current = refresh;
    refresh(initialScale);

    const loop = createGameLoop({
      goalRenderer: goal,
      goalieRenderer: goalie,
      playerRenderer: player,
      puckRenderer: puck,
      hitboxRenderer: hitboxes,
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
    const player = playerRef.current;
    const goalie = goalieRef.current;
    if (!loop || !puck || !goalie) return;
    const st = useTrainingStore.getState();
    if (!st.currentGoalieId || puck.isFlying() || puck.isHeld()) return;

    const cfg = getGoalie(st.currentGoalieId);
    const overrides = speedsRef.current;
    const activeCfg = { ...cfg, goalFrequency: overrides.goalFreq, frequency: overrides.goalieFreq };

    // tapTime для goalie/goal cross — sceneT (вратарь/ворота движутся по нему).
    // shooterTapTime — shooterT (шутер визуально движется по нему). Эти t
    // расходятся после первой паузы: шутер паузится с тапа, сцена с импакта,
    // суммарная разница накапливается. Без отдельного shooter-time
    // resolveShot пересчитал бы шутера от sceneT и получил позицию,
    // не соответствующую видимой → ложные miss/save.
    const tapTime = loop.getSceneT();
    const shooterTapTime = loop.getShooterT();
    const offsets = getSessionPhaseOffsets(st.seed);
    const sx = computeShooterX(shooterTapTime + offsets.shooter, overrides.shooterFreq);
    const result: ShotResult = resolveShot(
      {
        tapTime,
        shooterTapTime,
        puckSpeedPerMs: overrides.puckSpeed,
        shooterFrequency: overrides.shooterFreq,
      },
      activeCfg,
      st.seed,
      st.shotIndex,
      STICK_NEUTRAL,
      offsets,
    );

    // Phase 1 — flying: шутер замирает на текущей позиции, шайба летит
    loop.beginShooterPause();
    player?.playShot();
    puck.playShot(
      puck.bladePoint(sx),
      { x: sx, y: GOAL_OPENING.y },
      performance.now(),
      flightDurationMs,
    );

    // Phase 2 — paused (импакт): фриз сцены, hold puck, save-поза если save, applyResult, модалка
    window.setTimeout(() => {
      loop.beginScenePause();
      puck.holdAt({ x: sx, y: GOAL_OPENING.y });
      if (result.type === 'save') goalie.setSavePose(true);
      if (result.type === 'goal') goalRef.current?.triggerGoalLight();
      useTrainingStore.getState().applyResult(result);
      setIsShowingResult(true);
    }, flightDurationMs);

    // Phase 3 — idle: всё разморозить (t продолжается с того же значения,
    // вратарь/ворота/шутер возобновляют движение в ту же сторону)
    window.setTimeout(() => {
      loop.endScenePause();
      loop.endShooterPause();
      puck.release();
      if (result.type === 'save') goalie.setSavePose(false);
      setIsShowingResult(false);
    }, flightDurationMs + PAUSE_MS);
  }, [flightDurationMs]);

  useEffect(() => {
    hitboxesRef.current?.setVisible(showHitboxes);
  }, [showHitboxes]);

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

      {/* Debug toggle */}
      <div style={{ padding: '0 16px 6px', display: 'flex', justifyContent: 'flex-end' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: MUTED, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showHitboxes}
            onChange={(e) => setShowHitboxes(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          Хитбоксы
        </label>
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

      {/* Shot button */}
      <div style={{ padding: '0 16px 16px', display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={handleShotTap}
          disabled={shotDisabled}
          style={{
            width: '60%',
            height: 56,
            borderRadius: 14,
            border: 'none',
            background: shotDisabled
              ? 'linear-gradient(180deg, #b0bec5 0%, #90a4ae 100%)'
              : 'linear-gradient(180deg, #e05c5c 0%, #c43a3a 100%)',
            color: '#ffffff',
            fontSize: 17,
            fontWeight: 800,
            letterSpacing: 3,
            textTransform: 'uppercase',
            cursor: shotDisabled ? 'not-allowed' : 'pointer',
            boxShadow: shotDisabled
              ? 'none'
              : '0 4px 0 #8f2020, 0 6px 16px rgba(180,40,40,0.45), inset 0 1px 0 rgba(255,255,255,0.18)',
            touchAction: 'manipulation',
            transition: 'box-shadow 0.1s',
          }}
        >
          БРОСОК
        </button>
      </div>

      {/* Result modal */}
      {isShowingResult && state.lastResult && (
        <ResultModal result={state.lastResult} durationMs={PAUSE_MS} />
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
