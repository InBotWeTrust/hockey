import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Container } from 'pixi.js';
import type { Application } from 'pixi.js';
import {
  getGoalie,
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
import { Settings } from 'lucide-react';
import { PixiStage } from '../game/PixiStage.js';
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
import { Goal } from '../game/renderer/Goal.js';
import { Goalie } from '../game/renderer/Goalie.js';
import { Hitboxes } from '../game/renderer/Hitboxes.js';
import { Puck } from '../game/renderer/Puck.js';
import { Player } from '../game/renderer/Player.js';
import { createGameLoop, type GameLoop, type SpeedOverrides } from '../game/loop.js';
import type { Scale } from '../game/coords.js';
import { useTrainingStore } from '../stores/trainingStore.js';
import { useAuthStore } from '../auth/authStore.js';
import { ResultModal, type ResultModalKind } from '../components/ResultModal.js';
import { ScoreBoard } from '../components/ScoreBoard.js';
import { SettingsSheet } from '../components/SettingsSheet.js';
import { SpeedInput } from '../components/SpeedInput.js';

const ROOKIE_ID = 'rookie';
const PAUSE_MS = 1000;

const DEFAULT_SPEEDS: SpeedOverrides = {
  goalFreq: 0.55,
  goalieFreq: 0.65,
  shooterFreq: 0.8,
  puckSpeed: 1.3,
};

const PERSPECTIVE_PLAYER_OPTIONS = {
  spriteUrls: {
    left: '/sprites/ultimate-player-left.webp',
    right: '/sprites/ultimate-player-right.webp',
  },
  shotSpriteUrls: {
    left: '/sprites/ultimate-player-left-shoot.webp',
    right: '/sprites/ultimate-player-right-shoot.webp',
  },
  spriteWidth: 112,
  spriteAspect: 942 / 1067,
  baseRotation: 0,
  shotMaxRotation: 0,
  shotDurationMs: 500,
  visualYScale: TRAINING_NEW_COURT_VISUAL_Y_SCALE,
  visualYOffset: TRAINING_NEW_COURT_VISUAL_Y_OFFSET,
  shadow: true,
};

const PERSPECTIVE_GOAL_OPTIONS = {
  spriteUrl: '/sprites/test-goal-clean.webp',
  gateWidth: 102,
  gateAspect: 1097 / 734,
  visualYScale: TRAINING_NEW_COURT_VISUAL_Y_SCALE,
  visualYOffset: TRAINING_NEW_COURT_GOAL_VISUAL_Y_OFFSET,
  visualOffsetXScale: TRAINING_NEW_COURT_GOAL_VISUAL_OFFSET_X_SCALE,
  spriteAnchorY: 1,
};

const PERSPECTIVE_GOALIE_OPTIONS = {
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
};

const PERSPECTIVE_PUCK_OPTIONS = {
  radiusScaleX: 1.16,
  radiusScaleY: 0.82,
  rotation: 0,
  visualYScale: TRAINING_NEW_COURT_VISUAL_Y_SCALE,
  visualYOffset: TRAINING_NEW_COURT_VISUAL_Y_OFFSET,
  bladeOffsetX: TRAINING_NEW_COURT_PUCK_BLADE_OFFSET_X,
  bladeOffsetY: TRAINING_NEW_COURT_PUCK_BLADE_OFFSET_Y,
  flightVisualYOffset: TRAINING_NEW_COURT_PUCK_FLIGHT_VISUAL_Y_OFFSET,
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
  const [resultDisplayKind, setResultDisplayKind] = useState<ResultModalKind | null>(null);
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

    const goal = new Goal(PERSPECTIVE_GOAL_OPTIONS);
    const goalie = new Goalie(PERSPECTIVE_GOALIE_OPTIONS);
    const hitboxes = new Hitboxes({
      goalVisualYScale: PERSPECTIVE_GOAL_OPTIONS.visualYScale,
      goalVisualYOffset: PERSPECTIVE_GOAL_OPTIONS.visualYOffset,
      goalVisualOffsetXScale: PERSPECTIVE_GOAL_OPTIONS.visualOffsetXScale,
      goalWidthScale: TRAINING_NEW_COURT_HITBOX_GOAL_WIDTH_SCALE,
      goalHeightScale: TRAINING_NEW_COURT_HITBOX_GOAL_HEIGHT_SCALE,
      goalInset: TRAINING_NEW_COURT_HITBOX_GOAL_INSET,
      goalieVisualYScale: PERSPECTIVE_GOALIE_OPTIONS.visualYScale,
      goalieVisualYOffset: PERSPECTIVE_GOALIE_OPTIONS.visualYOffset,
      goalieVisualXScale: PERSPECTIVE_GOALIE_OPTIONS.visualXScale,
      goalieWidthScale: TRAINING_NEW_COURT_HITBOX_GOALIE_WIDTH_SCALE,
      goalieHeightScale: TRAINING_NEW_COURT_HITBOX_GOALIE_HEIGHT_SCALE,
      goalieInset: TRAINING_NEW_COURT_HITBOX_GOALIE_INSET,
    });
    const grip = useAuthStore.getState().user?.grip ?? 'right';
    const puck = new Puck(grip, PERSPECTIVE_PUCK_OPTIONS);
    const player = new Player(grip, PERSPECTIVE_PLAYER_OPTIONS);
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
    const activeCfg = {
      ...cfg,
      goalFrequency: overrides.goalFreq,
      frequency: overrides.goalieFreq,
    };

    const tapTime = loop.getSceneT();
    const shooterTapTime = loop.getShooterT();
    const offsets = getSessionPhaseOffsets(st.seed);
    const sx = computeShooterX(shooterTapTime + offsets.shooter, overrides.shooterFreq);
    const input = {
      tapTime,
      shooterTapTime,
      puckSpeedPerMs: overrides.puckSpeed,
      shooterFrequency: overrides.shooterFreq,
      goalieFrequency: overrides.goalieFreq,
      goalFrequency: overrides.goalFreq,
    };
    const result: ShotResult = resolveNewTrainingCourtShot({
      input,
      goalieConfig: activeCfg,
      seed: st.seed,
      shotIndex: st.shotIndex,
      stickEffects: STICK_NEUTRAL,
      phaseOffsets: offsets,
      shooterX: sx,
    });

    // Flavor text — deterministic, mirrors resolveShot internals
    let subText: string | null = null;
    let displayKind: ResultModalKind = result.type;
    if (result.type === 'save') {
      const tGoalieCross = tapTime + (PUCK_START.y - GOALIE_Y) / overrides.puckSpeed;
      const gs = simulateGoalie(
        activeCfg,
        st.seed,
        st.shotIndex,
        tGoalieCross,
        offsets.goalie ?? 0,
      );
      const rel = sx - gs.position.x;
      const sixth = gs.width / 6;
      subText =
        rel < -sixth
          ? 'Уверенная игра блином'
          : rel > sixth
            ? 'Точно в ловушку!'
            : 'Вратарь на месте!';
    } else if (result.type === 'goal') {
      const tGoalCross = tapTime + (PUCK_START.y - GOAL_OPENING.y) / overrides.puckSpeed;
      const goalOffsetAtGoal = simulateGoal(activeCfg, tGoalCross, offsets.goal ?? 0).offsetX;
      const oMin = GOAL_OPENING.xMin + goalOffsetAtGoal;
      const oMax = GOAL_OPENING.xMax + goalOffsetAtGoal;
      const rel = (sx - oMin) / (oMax - oMin); // 0=left edge, 1=right edge
      if (rel < 1 / 6 || rel > 5 / 6) subText = 'Точно в девятку!';
      else if (rel < 2 / 6 || rel > 4 / 6)
        subText = Math.random() < 0.5 ? 'Мощный щелчок!' : 'Отличный кистевой!';
      else subText = 'Отличный бросок!';
    } else if (result.type === 'miss') {
      const tGoalCross = tapTime + (PUCK_START.y - GOAL_OPENING.y) / overrides.puckSpeed;
      const goalOffsetAtGoal = simulateGoal(activeCfg, tGoalCross, offsets.goal ?? 0).offsetX;
      const dist = distanceToNewTrainingCourtGoalEdge(sx, goalOffsetAtGoal);
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
      useTrainingStore.getState().applyResult(result);
      setResultSubText(subText);
      setResultDisplayKind(displayKind);
      setIsShowingResult(true);
    }, flightDurationMs);

    window.setTimeout(() => {
      loop.endScenePause();
      loop.endShooterPause();
      puck.release();
      if (result.type === 'save') goalie.setSavePose(false);
      setIsShowingResult(false);
      setResultDisplayKind(null);
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
        top: 'calc(var(--app-safe-top) + 6px)',
        left: 0,
        right: 0,
        bottom: 'calc(76px + var(--app-safe-bottom))',
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
            aspectRatio: '1024 / 1428',
            width: '100%',
            maxHeight: '100%',
            borderRadius: 36,
            overflow: 'hidden',
            border: '3px solid #1e3a5f',
            background: '#EAF1F8',
          }}
        >
          <PerspectiveRink />
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

      {isShowingResult && state.lastResult && (
        <ResultModal
          result={state.lastResult}
          durationMs={PAUSE_MS}
          subText={resultSubText}
          displayKind={resultDisplayKind ?? undefined}
        />
      )}
    </main>
  );
}

function PerspectiveRink(): JSX.Element {
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
