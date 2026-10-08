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
  AMATEUR_DAILY_COURT_BACKGROUND,
  AMATEUR_TOURNAMENT_COURT_BACKGROUND,
  LONG_COURT_RINK_ASPECT_RATIO,
  LONG_COURT_GAME_LAYER_STYLE,
} from '../game/matchCourt.js';
import { UserAvatar } from '../chat/components/UserAvatar.js';
import { ResultModal } from '../components/ResultModal.js';
import { GameScoreboard } from '../components/ScoreBoard.js';
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
// Crop only the decorative upper fifth; retain the original scene proportions.
const courtRatio = LONG_COURT_RINK_ASPECT_RATIO.split('/').map(Number);
const croppedCourtRatio = `${courtRatio[0]} / ${courtRatio[1]! * 0.8}`;
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
  totalPeriods,
  kind = 'duel',
}: {
  player: BarPlayer;
  kind?: 'duel' | 'tournament';
  buffer: ReplayBuffer;
  motion?: BarMotion | undefined;
  totalPeriods?: number | null | undefined;
}): JSX.Element {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  const remaining = player.until
    ? Math.max(0, Math.ceil((Date.parse(player.until) - now) / 1000))
    : null;
  const timerText =
    remaining === null
      ? '—'
      : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  const [shot, setShot] = useState<BarShot | null>(null);
  const [resultDuration, setResultDuration] = useState(900);
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
    const setParticipantsVisible = (visible: boolean) => {
      actors.player.container.visible = visible;
      actors.goalie.container.visible = visible;
      actors.puck.container.visible = visible;
    };
    setParticipantsVisible(props.current.player.state !== 'break_active');
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
      setParticipantsVisible(current.state !== 'break_active');
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
          actors.puck.release();
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
      actors.goal.update(actors.scale, current.state === 'break_active' ? 0 : goalOffsetX);
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
          setResultDuration(Math.max(1, 1300 - active.flightMs));
          setShot(active.shot);
          actors.goalie.setSavePose(active.shot.result === 'save');
        }
      } else actors.puck.resetAtStart(actors.scale, sx);
    });
    if (document.hidden) app.stop();
  };
  return (
    <section className="bar-rink-panel" aria-label={`Площадка: ${player.name}`}>
      <header className="bar-rink-header">
        <span className="game-scoreboard game-scoreboard--stable-surface bar-player-avatar">
          <UserAvatar avatarUrl={player.avatarUrl} name={player.name} size={24} />
        </span>
        <strong>{player.name}</strong>
      </header>
      <GameScoreboard
        ariaLabel={`Статистика: ${player.name}`}
        rows={[
          {
            id: 'player',
            metrics: [
              { id: 'period', label: 'ПЕРИОД', value: `${player.period}/${totalPeriods ?? 3}` },
              {
                id: 'shots',
                label: 'БРОСКИ',
                value:
                  player.shots === undefined
                    ? '—'
                    : `${String(player.shots).padStart(2, '0')}${player.shotsTotal == null ? '' : `/${String(player.shotsTotal).padStart(2, '0')}`}`,
              },
              {
                id: 'timer',
                label: player.state === 'break_active' ? 'ПЕРЕРЫВ' : 'ВРЕМЯ',
                value: timerText,
                tone: 'timer',
              },
            ],
          },
        ]}
      />
      <div
        className="bar-rink"
        style={{ aspectRatio: croppedCourtRatio }}
        role="img"
        aria-label={shot ? `Бросок ${shot.index}: ${outcome[shot.result]}` : playerStatus(player)}
      >
        <div className="bar-rink-scene">
          <img
            className="bar-rink-background"
            src={
              kind === 'tournament'
                ? AMATEUR_TOURNAMENT_COURT_BACKGROUND
                : AMATEUR_DAILY_COURT_BACKGROUND
            }
            alt=""
            style={{ height: '100%' }}
          />
          <div className="bar-rink-stage" style={LONG_COURT_GAME_LAYER_STYLE}>
            <PixiStage
              onReady={ready}
              onResize={(scale) => {
                if (scene.current) scene.current.scale = scale;
              }}
              preloadAssets={preloadAssets}
              resolutionLimit={1.5}
            />
          </div>
        </div>
        {shot && player.state === 'period_active' && (
          <ResultModal
            key={shot.id}
            contained
            durationMs={resultDuration}
            result={
              shot.result === 'miss'
                ? { type: 'miss', reason: 'wide' }
                : shot.result === 'save'
                  ? { type: 'save', goalieContact: { x: shot.goalieX, y: GOALIE_Y } }
                  : { type: 'goal', hitPoint: { x: shot.goalX, y: GOAL_OPENING.y } }
            }
          />
        )}
        {player.state === 'break_active' && (
          <div
            role="status"
            className="modal-card duel-result-card duel-result-card--compact bar-rink-result"
          >
            <h3 className="modal-title">Текущий результат</h3>
            <div className="duel-result-card__compact-meta">
              <div className="duel-result-card__compact-fact">
                <span>Голы</span>
                <strong>{player.goals}</strong>
              </div>
              <div className="duel-result-card__compact-fact">
                <span>Броски</span>
                <strong>{player.shotsTaken ?? '—'}</strong>
              </div>
              <div className="duel-result-card__compact-fact">
                <span>Процент</span>
                <strong>
                  {player.shotsTaken === undefined
                    ? '—'
                    : `${player.shotsTaken > 0 ? Math.round((player.goals / player.shotsTaken) * 100) : 0}%`}
                </strong>
              </div>
            </div>
          </div>
        )}
        {!shot && !['period_active', 'break_active'].includes(player.state) && (
          <div className="modal-card bar-rink-result">
            <h3 className="modal-title">{playerStatus(player)}</h3>
          </div>
        )}
      </div>
    </section>
  );
}
