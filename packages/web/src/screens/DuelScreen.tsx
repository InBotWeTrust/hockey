import { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import type { Application } from 'pixi.js';
import {
  getGoalie,
  simulateGoalie,
  resolveShot,
  computeTrajectory,
  STICK_NEUTRAL,
  type ShotInput,
  type ShotResult,
} from '@hockey/game-core';
import { PixiStage } from '../game/PixiStage.js';
import { Rink } from '../game/renderer/Rink.js';
import { Goal } from '../game/renderer/Goal.js';
import { Goalie } from '../game/renderer/Goalie.js';
import { Puck } from '../game/renderer/Puck.js';
import { createGameLoop } from '../game/loop.js';
import { createDragInput } from '../game/input/DragInput.js';
import type { Scale } from '../game/coords.js';
import { useTrainingStore } from '../stores/trainingStore.js';

export function DuelScreen(): JSX.Element {
  const { goalieId } = useParams<{ goalieId: string }>();
  const navigate = useNavigate();

  const state = useTrainingStore();
  const scaleRef = useRef<Scale>({ factor: 1, offsetX: 0, offsetY: 0 });
  const [error, setError] = useState<string | null>(null);

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

  const handleReady = (app: Application, initialScale: Scale): void => {
    scaleRef.current = initialScale;

    const rink = new Rink();
    const goal = new Goal();
    const goalie = new Goalie();
    const puck = new Puck();

    app.stage.addChild(rink.container);
    app.stage.addChild(goal.container);
    app.stage.addChild(goalie.container);
    app.stage.addChild(puck.container);

    const refresh = (s: Scale): void => {
      scaleRef.current = s;
      rink.update(s);
      goal.update(s);
      puck.resetAtStart(s);
    };
    refresh(initialScale);

    const loop = createGameLoop({
      goalieRenderer: goalie,
      puckRenderer: puck,
      getScale: () => scaleRef.current,
      getSeed: () => useTrainingStore.getState().seed,
      getShotIndex: () => useTrainingStore.getState().shotIndex,
      getGoalieId: () => useTrainingStore.getState().currentGoalieId,
    });
    loop.attach(app.ticker);

    const input = createDragInput();
    input.attach(
      app.canvas,
      () => scaleRef.current,
      (shot: ShotInput) => {
        const st = useTrainingStore.getState();
        if (!st.currentGoalieId || puck.isFlying() || st.isCleared) return;
        const cfg = getGoalie(st.currentGoalieId);
        const goalieState = simulateGoalie(
          cfg,
          st.seed,
          st.shotIndex,
          performance.now() - loop.sessionStartMs,
        );
        const tr = computeTrajectory(shot);
        const result: ShotResult = resolveShot(shot, goalieState, STICK_NEUTRAL);
        puck.playShot(tr.start, tr.end, performance.now());
        window.setTimeout(() => {
          useTrainingStore.getState().applyResult(result);
          puck.resetAtStart(scaleRef.current);
        }, 320);
      },
    );
  };

  const handleResize = (s: Scale): void => {
    scaleRef.current = s;
  };

  if (error) {
    return (
      <main style={{ padding: 24 }}>
        <p style={{ color: '#c0392b' }}>{error}</p>
        <Link to="/">← На выбор босса</Link>
      </main>
    );
  }

  const cfg = state.currentGoalieId ? getGoalie(state.currentGoalieId) : null;
  const hpPct = cfg ? Math.round((state.hpLeft / cfg.hp) * 100) : 0;

  return (
    <main
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: '#0b2e5c',
      }}
    >
      <header
        style={{
          padding: '12px 16px',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'transparent',
            color: 'white',
            border: '1px solid white',
            padding: '4px 12px',
            borderRadius: 4,
          }}
        >
          ← Назад
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, opacity: 0.8 }}>Босс</div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{cfg?.name ?? '—'}</div>
        </div>
        <div style={{ fontSize: 14, textAlign: 'right' }}>
          <div>Голы: {state.sessionGoals}</div>
          <div>Промахи: {state.sessionMisses}</div>
          <div>Стрик: {state.streak}</div>
        </div>
      </header>
      <div style={{ padding: '0 16px 8px', color: 'white' }}>
        <div
          style={{
            height: 8,
            background: 'rgba(255,255,255,0.15)',
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${hpPct}%`,
              background: '#ff5a5a',
              transition: 'width 200ms',
            }}
          />
        </div>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
          HP: {state.hpLeft} / {cfg?.hp ?? '?'}
        </div>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <PixiStage onReady={handleReady} onResize={handleResize} />
        {state.isCleared && cfg && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.55)',
              color: 'white',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 32, fontWeight: 700 }}>Босс повержен!</div>
            <button
              onClick={() => useTrainingStore.getState().startDuel(cfg.id)}
              style={{ padding: '8px 24px', fontSize: 16 }}
            >
              Ещё раз
            </button>
            <Link to="/" style={{ color: 'white' }}>
              К списку боссов
            </Link>
          </div>
        )}
        {state.lastResult && !state.isCleared && (
          <div
            key={state.shotIndex}
            style={{
              position: 'absolute',
              top: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              color: 'white',
              fontSize: 20,
              fontWeight: 600,
              background: 'rgba(0,0,0,0.4)',
              padding: '4px 12px',
              borderRadius: 4,
            }}
          >
            {state.lastResult.type === 'goal' && 'ГОЛ!'}
            {state.lastResult.type === 'save' && 'Сэйв'}
            {state.lastResult.type === 'miss' &&
              `Мимо (${state.lastResult.reason})`}
          </div>
        )}
      </div>
    </main>
  );
}
