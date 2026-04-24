import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Container } from 'pixi.js';
import type { Application } from 'pixi.js';
import {
  getGoalie,
  resolveShot,
  getSessionPhaseOffsets,
  simulateGoalie,
  simulateGoal,
  STICK_NEUTRAL,
  PUCK_START,
  GOAL_OPENING,
  GOALIE_Y,
  SHOOTER_CENTER_X,
  SHOOTER_AMPLITUDE,
  type ShotResult,
} from '@hockey/game-core';
import { RotateCcw, Settings } from 'lucide-react';
import { PixiStage } from '../game/PixiStage.js';
import { RinkSvg } from '../game/RinkSvg.js';
import { Goal } from '../game/renderer/Goal.js';
import { Goalie } from '../game/renderer/Goalie.js';
import { Hitboxes } from '../game/renderer/Hitboxes.js';
import { Puck } from '../game/renderer/Puck.js';
import { Player } from '../game/renderer/Player.js';
import { createGameLoop, type GameLoop, type SpeedOverrides } from '../game/loop.js';
import type { Scale } from '../game/coords.js';
import { useTrainingStore } from '../stores/trainingStore.js';
import { useAuthStore } from '../auth/authStore.js';
import { ResultModal } from '../components/ResultModal.js';
import { ScoreBoard } from '../components/ScoreBoard.js';
import { SettingsSheet } from '../components/SettingsSheet.js';

const ROOKIE_ID = 'rookie';
const PAUSE_MS = 1000;

const DEFAULT_SPEEDS: SpeedOverrides = {
  goalFreq: 0.55,
  goalieFreq: 0.65,
  shooterFreq: 0.8,
  puckSpeed: 1.3,
};

function computeShooterX(t: number, freq: number): number {
  const period = 1000 / freq;
  const phase = (((t % period) + period) % period) / period;
  const tri = phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4;
  return SHOOTER_CENTER_X + SHOOTER_AMPLITUDE * tri;
}

function formatTimer(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${m}:${s}`;
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
  const [resultSubText, setResultSubText] = useState<string | null>(null);
  const [showHitboxes, setShowHitboxes] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

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

  useEffect(() => {
    const start = performance.now();
    setElapsedMs(0);
    const id = window.setInterval(() => {
      setElapsedMs(performance.now() - start);
    }, 500);
    return () => window.clearInterval(id);
  }, [goalieId]);

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

    const gameLayer = new Container();
    gameLayer.addChild(goal.container);
    gameLayer.addChild(goalie.container);
    gameLayer.addChild(player.container);
    gameLayer.addChild(puck.container);
    gameLayer.addChild(hitboxes.container);

    app.stage.addChild(gameLayer);

    const refresh = (s: Scale): void => {
      scaleRef.current = s;
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

    // Flavor text — deterministic, mirrors resolveShot internals
    let subText: string | null = null;
    if (result.type === 'save') {
      const tGoalieCross = tapTime + (PUCK_START.y - GOALIE_Y) / overrides.puckSpeed;
      const gs = simulateGoalie(activeCfg, st.seed, st.shotIndex, tGoalieCross, offsets.goalie ?? 0);
      const rel = sx - gs.position.x;
      const sixth = gs.width / 6;
      subText = rel < -sixth ? 'Уверенная игра блином' : rel > sixth ? 'Точно в ловушку!' : 'Вратарь на месте!';
    } else if (result.type === 'goal') {
      const tGoalCross = tapTime + (PUCK_START.y - GOAL_OPENING.y) / overrides.puckSpeed;
      const goalOffsetAtGoal = simulateGoal(activeCfg, tGoalCross, offsets.goal ?? 0).offsetX;
      const oMin = GOAL_OPENING.xMin + goalOffsetAtGoal;
      const oMax = GOAL_OPENING.xMax + goalOffsetAtGoal;
      const rel = (sx - oMin) / (oMax - oMin); // 0=left edge, 1=right edge
      if (rel < 1 / 6 || rel > 5 / 6) subText = 'Точно в девятку!';
      else if (rel < 2 / 6 || rel > 4 / 6) subText = Math.random() < 0.5 ? 'Мощный щелчок!' : 'Отличный кистевой!';
      else subText = 'Отличный бросок!';
    } else if (result.type === 'miss') {
      const tGoalCross = tapTime + (PUCK_START.y - GOAL_OPENING.y) / overrides.puckSpeed;
      const goalOffsetAtGoal = simulateGoal(activeCfg, tGoalCross, offsets.goal ?? 0).offsetX;
      const oMin = GOAL_OPENING.xMin + goalOffsetAtGoal;
      const oMax = GOAL_OPENING.xMax + goalOffsetAtGoal;
      const dist = Math.max(oMin - sx, sx - oMax, 0);
      subText = dist <= 3 ? 'Штанга спасает!' : dist < 18 ? 'Рядом со штангой!' : dist < 48 ? 'Но было опасно!' : 'Очень далеко...';
    }

    loop.beginShooterPause();
    player?.playShot();
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
      useTrainingStore.getState().applyResult(result);
      setResultSubText(subText);
      setIsShowingResult(true);
    }, flightDurationMs);

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
  const timerLabel = useMemo(() => formatTimer(elapsedMs), [elapsedMs]);

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
          period={1}
          timer={timerLabel}
          goals={state.sessionGoals}
          shots={state.shotIndex}
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
          {import.meta.env.DEV && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Настройки (dev)"
              style={{
                position: 'absolute',
                bottom: 18,
                right: 18,
                width: 30,
                height: 30,
                borderRadius: 999,
                border: '1px solid rgba(255, 255, 255, 0.6)',
                background: 'rgba(255, 255, 255, 0.45)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                color: 'var(--ink)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0.55,
                cursor: 'pointer',
                padding: 0,
                zIndex: 3,
              }}
            >
              <Settings size={14} />
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: '0 14px 10px', display: 'flex', justifyContent: 'center' }}>
        <button
          type="button"
          className="btn btn--cta"
          onClick={handleShotTap}
          disabled={shotDisabled}
          style={{ width: '100%' }}
        >
          БРОСОК
        </button>
      </div>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
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

      {isShowingResult && state.lastResult && (
        <ResultModal result={state.lastResult} durationMs={PAUSE_MS} subText={resultSubText} />
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
      className="glass"
      style={{
        borderRadius: 14,
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          style={{
            fontSize: 10,
            letterSpacing: 0.8,
            color: 'var(--muted)',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          {label}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
            {value.toFixed(2)}
          </span>
          <button
            type="button"
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
            aria-label="Сбросить"
          >
            <RotateCcw size={11} color="var(--ink)" />
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
        style={{ width: '100%', accentColor: 'var(--ink)', cursor: 'pointer' }}
      />
    </div>
  );
}
