import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import type { Application } from 'pixi.js';
import {
  getGoalie,
  resolveShot,
  simulateShooter,
  STICK_NEUTRAL,
  PUCK_SPEED_PER_MS,
  PUCK_START,
  GOAL_OPENING,
  type ShotResult,
} from '@hockey/game-core';
import { PixiStage } from '../game/PixiStage.js';
import { Rink } from '../game/renderer/Rink.js';
import { Goal } from '../game/renderer/Goal.js';
import { Goalie } from '../game/renderer/Goalie.js';
import { Puck } from '../game/renderer/Puck.js';
import { Player } from '../game/renderer/Player.js';
import { createGameLoop, type GameLoop } from '../game/loop.js';
import type { Scale } from '../game/coords.js';
import { useTrainingStore } from '../stores/trainingStore.js';

const BG = '#101830';
const PANEL = '#1a2547';
const PANEL_BORDER = '#2a3867';
const TEXT = '#ffffff';
const MUTED = '#94a3b8';
const ACCENT = '#e23636';
const ACCENT_ORANGE = '#ff8a3c';
const GOOD = '#38d38a';

const FLIGHT_DURATION_MS =
  (PUCK_START.y - GOAL_OPENING.y) / PUCK_SPEED_PER_MS;

export function DuelScreen(): JSX.Element {
  const { goalieId } = useParams<{ goalieId: string }>();
  const navigate = useNavigate();

  const state = useTrainingStore();
  const scaleRef = useRef<Scale>({ factor: 1, offsetX: 0, offsetY: 0 });
  const loopRef = useRef<GameLoop | null>(null);
  const puckRef = useRef<Puck | null>(null);
  const refreshRef = useRef<((s: Scale) => void) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isShowingResult, setIsShowingResult] = useState(false);
  const isFirstShot = useRef(true);

  useEffect(() => {
    if (isFirstShot.current) { isFirstShot.current = false; return; }
    if (!state.lastResult || state.isCleared) return;
    setIsShowingResult(true);
    const t = setTimeout(() => setIsShowingResult(false), 850);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.shotIndex]);

  useEffect(() => {
    if (!goalieId) {
      setError('Не указан босс');
      return;
    }
    try {
      getGoalie(goalieId);
      useTrainingStore.getState().startDuel(goalieId);
    } catch {
      setError(`Неизвестный босс: ${goalieId}`);
    }
    return () => useTrainingStore.getState().reset();
  }, [goalieId]);

  const handleReady = useCallback((app: Application, initialScale: Scale): void => {
    scaleRef.current = initialScale;

    const rink = new Rink();
    const goal = new Goal();
    const goalie = new Goalie();
    const puck = new Puck();
    const player = new Player();
    puckRef.current = puck;

    app.stage.addChild(rink.container);
    app.stage.addChild(goal.container);
    app.stage.addChild(goalie.container);
    app.stage.addChild(player.container);
    app.stage.addChild(puck.container);

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
      getScale: () => scaleRef.current,
      getSeed: () => useTrainingStore.getState().seed,
      getShotIndex: () => useTrainingStore.getState().shotIndex,
      getGoalieId: () => useTrainingStore.getState().currentGoalieId,
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
    if (!st.currentGoalieId || puck.isFlying() || st.isCleared) return;

    const cfg = getGoalie(st.currentGoalieId);
    const tapTime = performance.now() - loop.sessionStartMs;
    const shooterX = simulateShooter(tapTime).x;
    const result: ShotResult = resolveShot(
      { tapTime },
      cfg,
      st.seed,
      st.shotIndex,
      STICK_NEUTRAL,
    );

    puck.playShot(
      { x: shooterX, y: PUCK_START.y },
      { x: shooterX, y: GOAL_OPENING.y },
      performance.now(),
      FLIGHT_DURATION_MS,
    );
    window.setTimeout(() => {
      useTrainingStore.getState().applyResult(result);
      puck.resetAtStart(scaleRef.current, simulateShooter(
        performance.now() - loop.sessionStartMs,
      ).x);
    }, FLIGHT_DURATION_MS + 20);
  }, []);

  if (error) {
    return (
      <main style={{ padding: 24, background: BG, color: TEXT, minHeight: '100vh' }}>
        <p style={{ color: '#ff8a8a' }}>{error}</p>
        <Link to="/" style={{ color: TEXT }}>← На выбор босса</Link>
      </main>
    );
  }

  const cfg = state.currentGoalieId ? getGoalie(state.currentGoalieId) : null;
  const hpPct = cfg ? Math.max(0, Math.min(100, (state.hpLeft / cfg.hp) * 100)) : 0;
  const bossNum = cfg ? 1 : 0;
  const shotDisabled = !cfg || state.isCleared || isShowingResult;

  return (
    <main
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: BG,
        color: TEXT,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <header
        style={{
          padding: '12px 16px 8px',
          display: 'grid',
          gridTemplateColumns: '36px 1fr 36px',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <button
          onClick={() => navigate('/')}
          aria-label="Назад"
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: PANEL,
            border: `1px solid ${PANEL_BORDER}`,
            color: TEXT,
            cursor: 'pointer',
            fontSize: 16,
            display: 'grid',
            placeItems: 'center',
            padding: 0,
          }}
        >
          ‹
        </button>
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: 2,
              color: MUTED,
              textTransform: 'uppercase',
            }}
          >
            Босс · {String(bossNum).padStart(2, '0')} / 10
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 0.5 }}>
            {cfg?.name ?? '—'}
          </div>
        </div>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: PANEL,
            border: `1px solid ${PANEL_BORDER}`,
            color: MUTED,
            display: 'grid',
            placeItems: 'center',
            fontSize: 18,
            letterSpacing: 2,
          }}
        >
          ···
        </div>
      </header>

      <div
        style={{
          padding: '0 16px 12px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 8,
        }}
      >
        <StatPill label="Голы" value={state.sessionGoals} dotColor={GOOD} />
        <StatPill label="Мимо" value={state.sessionMisses} dotColor={ACCENT} crossed />
        <StatPill
          label="Стрик"
          value={`×${state.streak}`}
          dotColor={ACCENT_ORANGE}
          bolt
        />
      </div>

      <div style={{ padding: '0 16px 12px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            fontSize: 10,
            letterSpacing: 2,
            color: MUTED,
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          <span>HP вратаря</span>
          <span style={{ color: TEXT, fontWeight: 700 }}>
            {state.hpLeft} / {cfg?.hp ?? '?'}
          </span>
        </div>
        <div
          style={{
            height: 10,
            background: PANEL,
            borderRadius: 6,
            border: `1px solid ${PANEL_BORDER}`,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${hpPct}%`,
              background: `linear-gradient(90deg, ${ACCENT} 0%, ${ACCENT_ORANGE} 100%)`,
              transition: 'width 280ms ease',
            }}
          />
        </div>
      </div>

      <div
        style={{
          flex: 1,
          position: 'relative',
          margin: '0 12px 12px',
          borderRadius: 18,
          overflow: 'hidden',
          border: `1px solid ${PANEL_BORDER}`,
          background: '#f5f8fc',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        }}
      >
        <PixiStage onReady={handleReady} onResize={handleResize} />
        {state.isCleared && cfg && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(15,22,46,0.82)',
              color: TEXT,
              flexDirection: 'column',
              gap: 16,
              padding: 24,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: 1 }}>
              Босс повержен!
            </div>
            <button
              onClick={() => useTrainingStore.getState().startDuel(cfg.id)}
              style={{
                padding: '12px 28px',
                fontSize: 16,
                fontWeight: 700,
                background: ACCENT,
                color: TEXT,
                border: 'none',
                borderRadius: 10,
                cursor: 'pointer',
              }}
            >
              Ещё раз
            </button>
            <Link to="/" style={{ color: MUTED, textDecoration: 'none' }}>
              К списку боссов
            </Link>
          </div>
        )}
      </div>

      <div style={{ padding: '0 16px 16px' }}>
        <button
          onClick={handleShotTap}
          disabled={shotDisabled}
          style={{
            width: '100%',
            height: 64,
            borderRadius: 16,
            border: 'none',
            background: shotDisabled
              ? '#3a4a7a'
              : `linear-gradient(180deg, ${ACCENT_ORANGE} 0%, ${ACCENT} 100%)`,
            color: TEXT,
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: 3,
            textTransform: 'uppercase',
            cursor: shotDisabled ? 'not-allowed' : 'pointer',
            boxShadow: shotDisabled
              ? 'none'
              : '0 6px 20px rgba(226,54,54,0.45)',
            touchAction: 'manipulation',
          }}
        >
          Бросок
        </button>
      </div>

      {/* Full-screen centered result modal */}
      {isShowingResult && state.lastResult && !state.isCleared && (
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
              {state.lastResult.type === 'goal' && 'ГОЛ!'}
              {state.lastResult.type === 'save' && 'СЭЙВ'}
              {state.lastResult.type === 'miss' && 'МИМО'}
            </div>
          </div>
        </>
      )}
    </main>
  );
}

interface StatPillProps {
  label: string;
  value: number | string;
  dotColor: string;
  crossed?: boolean;
  bolt?: boolean;
}

function StatPill({ label, value, dotColor, crossed, bolt }: StatPillProps): JSX.Element {
  const formatted = typeof value === 'number' ? String(value).padStart(2, '0') : value;
  return (
    <div
      style={{
        background: PANEL,
        border: `1px solid ${PANEL_BORDER}`,
        borderRadius: 14,
        padding: '8px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: crossed ? 'rgba(226,54,54,0.18)' : bolt ? 'rgba(255,138,60,0.18)' : 'rgba(56,211,138,0.18)',
          color: dotColor,
          display: 'grid',
          placeItems: 'center',
          fontSize: 12,
          fontWeight: 800,
          flexShrink: 0,
        }}
      >
        {crossed ? '×' : bolt ? '⚡' : '•'}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
        <span
          style={{
            fontSize: 9,
            letterSpacing: 1.5,
            color: MUTED,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>
          {formatted}
        </span>
      </div>
    </div>
  );
}
