import { useEffect, useMemo, useRef, useState } from 'react';
import type { Application } from 'pixi.js';
import {
  GOAL,
  GOALIE_SIZE,
  GOALIE_Y,
  GOAL_OPENING,
  PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE,
  PERSPECTIVE_COURT_GOAL_VISUAL_OFFSET_X_SCALE,
} from '@hockey/game-core';
import { PixiStage } from '../game/PixiStage.js';
import type { Scale } from '../game/coords.js';
import { Player } from '../game/renderer/Player.js';
import { Goal } from '../game/renderer/Goal.js';
import { Goalie } from '../game/renderer/Goalie.js';
import { Puck } from '../game/renderer/Puck.js';
import {
  PERSPECTIVE_PLAYER_OPTIONS,
  PERSPECTIVE_GOAL_OPTIONS,
  PERSPECTIVE_GOALIE_OPTIONS,
  PERSPECTIVE_PUCK_OPTIONS,
} from '../game/perspectiveActors.js';
import {
  TRAINING_NEW_COURT_BACKGROUND,
  TRAINING_NEW_COURT_BG_CROP_BOTTOM,
} from '../game/trainingNewCourt.js';
import { MotionTimeline } from './motion.js';
import type { BarPlayer, BarShot, BarMotion } from './types.js';
import type { ReplayBuffer } from './replay.js';

export function playerStatus(player: BarPlayer): string {
  if (player.state === 'break_active') return 'Перерыв';
  if (['completed', 'forfeit'].includes(player.state)) return 'Закончил игру';
  if (player.state === 'paused') return 'Игра приостановлена';
  if (player.state === 'period_active') return `Период ${player.period}`;
  return 'Ожидает продолжения';
}
const outcome = { goal: 'Гол!', save: 'Сейв', miss: 'Мимо' };
const preloadAssets = [
  PERSPECTIVE_GOAL_OPTIONS.spriteUrl!,
  PERSPECTIVE_GOALIE_OPTIONS.idleSpriteUrl!,
  PERSPECTIVE_GOALIE_OPTIONS.saveSpriteUrl!,
];
interface Scene {
  app: Application;
  scale: Scale;
  player: Player;
  goal: Goal;
  goalie: Goalie;
  puck: Puck;
}
export function SpectatorRink({
  player,
  buffer,
  motion,
}: {
  player: BarPlayer;
  buffer: ReplayBuffer;
  motion?: BarMotion | undefined;
}): JSX.Element {
  const [shot, setShot] = useState<BarShot | null>(null);
  const props = useRef({ player, buffer });
  props.current = { player, buffer };
  const scene = useRef<Scene | null>(null);
  const timeline = useMemo(() => new MotionTimeline(), []);
  useEffect(() => {
    if (motion) timeline.push(motion, performance.now());
  }, [motion, timeline]);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) scene.current?.app.stop();
      else scene.current?.app.start();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      const current = scene.current;
      scene.current = null;
      if (current) {
        current.app.stop();
        current.player.destroy();
        current.goal.destroy();
        current.goalie.destroy();
        current.puck.destroy();
      }
    };
  }, []);
  const ready = (app: Application, scale: Scale) => {
    const actors: Scene = {
      app,
      scale,
      player: new Player(props.current.player.grip, PERSPECTIVE_PLAYER_OPTIONS),
      goal: new Goal(PERSPECTIVE_GOAL_OPTIONS),
      goalie: new Goalie(PERSPECTIVE_GOALIE_OPTIONS),
      puck: new Puck(props.current.player.grip, PERSPECTIVE_PUCK_OPTIONS),
    };
    scene.current = actors;
    app.stage.addChild(
      actors.goal.container,
      actors.goalie.container,
      actors.player.container,
      actors.puck.container,
    );
    app.ticker.maxFPS = 30;
    let active: { shot: BarShot; startedAt: number; flightMs: number; impact: boolean } | null =
      null;
    let nextShotAt = 0;
    app.ticker.add(() => {
      if (document.hidden || scene.current !== actors) return;
      const now = performance.now();
      const current = props.current.player;
      if (active && now - active.startedAt >= 1300) {
        active = null;
        setShot(null);
        actors.goalie.setSavePose(false);
      }
      if (!active && now >= nextShotAt) {
        const next = props.current.buffer.take(current.userId);
        if (next && next.period === current.period) {
          const path = actors.puck.shotPath(
            next.shooterX,
            next.result === 'save' ? GOALIE_Y : GOAL_OPENING.y,
          );
          const flightMs = Math.max(180, Math.abs(path.end.y - path.start.y) / 1.2);
          active = { shot: next, startedAt: now, flightMs, impact: false };
          nextShotAt = now + 1300;
          actors.player.playShot();
          actors.puck.playShot(path.start, path.end, now, flightMs);
        }
      }
      const frame = timeline.sample(current.period, now);
      const sx = active?.shot.shooterX ?? frame?.shooterX ?? 286;
      const goalOffsetX = active
        ? (active.shot.goalX - (GOAL.x + GOAL.width / 2)) /
          PERSPECTIVE_COURT_GOAL_VISUAL_OFFSET_X_SCALE
        : (frame?.goalOffsetX ?? 0);
      const gx = active
        ? 286 + (active.shot.goalieX - 286) / PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE
        : (frame?.goalieX ?? 286);
      actors.player.update(actors.scale, sx, undefined, {
        resting: current.state === 'break_active',
      });
      actors.goal.update(actors.scale, goalOffsetX);
      actors.goalie.update(
        {
          position: { x: gx, y: frame?.goalieY ?? GOALIE_Y },
          width: GOALIE_SIZE.width,
          height: GOALIE_SIZE.height,
        },
        actors.scale,
      );
      if (active) {
        actors.puck.update(now, actors.scale);
        if (!active.impact && now - active.startedAt >= active.flightMs) {
          active.impact = true;
          setShot(active.shot);
          actors.goalie.setSavePose(active.shot.result === 'save');
          if (active.shot.result === 'goal') actors.goal.triggerGoalLight();
        }
      } else actors.puck.resetAtStart(actors.scale, sx);
    });
    if (document.hidden) app.stop();
  };
  return (
    <section className="bar-rink-panel" aria-label={`Площадка: ${player.name}`}>
      <header className="bar-rink-header">
        <strong>{player.name}</strong>
        <b>{player.goals}</b>
      </header>
      <div
        className="bar-rink"
        role="img"
        aria-label={shot ? `Бросок ${shot.index}: ${outcome[shot.result]}` : playerStatus(player)}
      >
        <img
          className="bar-rink-background"
          src={TRAINING_NEW_COURT_BACKGROUND}
          alt=""
          style={{ height: `calc(100% + ${TRAINING_NEW_COURT_BG_CROP_BOTTOM})` }}
        />
        <div className="bar-rink-stage">
          <PixiStage
            onReady={ready}
            onResize={(scale) => {
              if (scene.current) scene.current.scale = scale;
            }}
            preloadAssets={preloadAssets}
            resolutionLimit={1.5}
          />
        </div>
        {(shot || player.state !== 'period_active') && (
          <div
            className={`bar-rink-notice${shot?.result === 'goal' ? ' bar-rink-notice--goal' : ''}`}
          >
            {shot ? outcome[shot.result] : playerStatus(player)}
          </div>
        )}
      </div>
      <p className="bar-rink-status">{playerStatus(player)}</p>
    </section>
  );
}
