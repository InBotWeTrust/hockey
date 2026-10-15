import * as darts from './darts.js';
import * as checkers from './checkers.js';
import * as pool from './pool.js';
export type BarGameId = 'darts' | 'billiards' | 'checkers';
export type BarGame = darts.Game | checkers.Game | pool.Game;
export type BarGameAction =
  | { type: 'dart'; gesture: darts.Gesture }
  | { type: 'checkers'; path: number[] }
  | { type: 'place'; point: darts.Point }
  | { type: 'shot'; angle: number; power: number }
  | { type: 'surrender' };
export const ENGINE_VERSION = 1;
export const TURN_MS = 40000;
export const CHARACTER_GAME = {
  maria: 'darts',
  veronika: 'billiards',
  arsenich: 'checkers',
} as const;
export type GameCharacter = keyof typeof CHARACTER_GAME;
export interface Runtime {
  engineVersion: number;
  game: BarGame;
  deadline: number;
  animationUntil: number;
  missed: [number, number];
  computer: boolean;
  seed: number;
  reason: 'played' | 'surrender' | 'inactivity' | null;
  lastDart: darts.Point | null;
  poolFrames: pool.Ball[][];
  animationStart: number;
  revision: number;
}
export function createMatch(
  kind: BarGameId,
  starter: darts.Player,
  now: number,
  computer: boolean,
  seed: number,
): Runtime {
  return {
    engineVersion: ENGINE_VERSION,
    game:
      kind === 'darts'
        ? darts.create(starter)
        : kind === 'checkers'
          ? checkers.create(starter)
          : pool.create(starter),
    deadline: now + TURN_MS,
    animationUntil: now + (computer && starter === 1 ? 900 : 0),
    missed: [0, 0],
    computer,
    seed,
    reason: null,
    lastDart: null,
    poolFrames: [],
    animationStart: now,
    revision: 0,
  };
}
function random(m: Runtime): number {
  m.seed = (Math.imul(1664525, m.seed) + 1013904223) >>> 0;
  return m.seed / 4294967296;
}
function perform(m: Runtime, action: BarGameAction, now: number, manual: boolean): Runtime {
  const n: Runtime = {
    ...m,
    missed: [...m.missed],
    poolFrames: [],
    lastDart: null,
    revision: m.revision + 1,
    animationStart: now,
  };
  const p = m.game.turn;
  let duration = 0;
  if (action.type === 'surrender') {
    n.game = { ...m.game, winner: p === 0 ? 1 : 0 };
    n.reason = 'surrender';
    return n;
  }
  if (m.game.kind === 'darts' && action.type === 'dart') {
    n.lastDart = darts.aim(action.gesture);
    n.game = darts.hit(m.game, n.lastDart);
    duration = 600;
  } else if (m.game.kind === 'checkers' && action.type === 'checkers') {
    n.game = checkers.move(m.game, action.path);
    duration = 350;
  } else if (m.game.kind === 'billiards' && action.type === 'place') {
    n.game = pool.place(m.game, action.point);
    return n;
  } else if (m.game.kind === 'billiards' && action.type === 'shot') {
    const sim = pool.shoot(m.game, action);
    n.game = sim.game;
    n.poolFrames = sim.frames;
    duration = sim.durationMs;
  } else throw new Error('Wrong game action');
  if (manual) n.missed[p] = 0;
  n.animationUntil = now + duration + (n.computer && n.game.turn === 1 ? 900 : 0);
  n.deadline =
    n.game.turn !== p || m.game.kind !== 'darts' ? now + duration + TURN_MS : m.deadline + duration;
  if (n.game.winner !== null) n.reason = 'played';
  return n;
}
export function command(
  m: Runtime,
  player: darts.Player,
  action: BarGameAction,
  now: number,
): Runtime {
  if (m.engineVersion !== ENGINE_VERSION || m.game.winner !== null)
    throw new Error('Inactive game');
  if (action.type === 'surrender')
    return {
      ...m,
      game: { ...m.game, winner: player === 0 ? 1 : 0 },
      reason: 'surrender',
      revision: m.revision + 1,
    };
  if (m.game.turn !== player || now >= m.deadline || now < m.animationUntil)
    throw new Error('Not your turn');
  return perform(m, action, now, true);
}
export function advance(m: Runtime, now: number): Runtime {
  if (m.engineVersion !== ENGINE_VERSION) throw new Error('Unsupported game version');
  let n = m;
  for (let i = 0; i < 64 && n.game.winner === null; i++) {
    if (n.computer && n.game.turn === 1) {
      if (now < n.animationUntil) break;
      const at = n.animationUntil;
      if (n.game.kind === 'checkers')
        n = perform(n, { type: 'checkers', path: checkers.bot(n.game) }, at, false);
      else if (n.game.kind === 'billiards') {
        const b = pool.bot(n.game);
        if (b.placement) n = perform(n, { type: 'place', point: b.placement }, at, false);
        n = perform(n, { type: 'shot', ...b.shot }, at, false);
      } else {
        const copy = { ...n };
        const target = Math.min(n.game.scores[1], 60);
        const x = (random(copy) - 0.5) * 0.18;
        // Aim near triple twenty, adjusting toward an ordinary closing sector when possible.
        const sectors = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
        const index = target <= 20 ? sectors.indexOf(target) : 0;
        const angle = (index * Math.PI) / 10;
        const radius = target <= 20 ? 0.4 : 0.595;
        const point = {
          x: Math.sin(angle) * radius + x,
          y: -Math.cos(angle) * radius + (random(copy) - 0.5) * 0.15,
        };
        const speed = (1.6 - point.y) / 1280;
        n = perform(
          copy,
          {
            type: 'dart',
            gesture: { dy: -speed * 400, dx: (point.x / 1.4) * speed * 400, durationMs: 400 },
          },
          at,
          false,
        );
      }
    } else if (now >= n.deadline) {
      const p = n.game.turn;
      const missed: [number, number] = [...n.missed];
      missed[p]++;
      if (missed[p] >= 2) {
        n = {
          ...n,
          missed,
          game: { ...n.game, winner: p === 0 ? 1 : 0 },
          reason: 'inactivity',
          revision: n.revision + 1,
        };
        break;
      }
      const game =
        n.game.kind === 'darts'
          ? darts.timeout(n.game)
          : n.game.kind === 'billiards'
            ? pool.timeout(n.game)
            : checkers.move(n.game, checkers.moves(n.game)[0]!);
      const at = n.deadline;
      n = {
        ...n,
        game,
        missed,
        revision: n.revision + 1,
        deadline: at + TURN_MS,
        animationStart: at,
        animationUntil:
          at + (game.kind === 'checkers' ? 350 : 0) + (n.computer && game.turn === 1 ? 900 : 0),
        poolFrames: [],
        lastDart: null,
        reason: game.winner !== null ? 'played' : null,
      };
      n.deadline += game.kind === 'checkers' ? 350 : 0;
    } else break;
  }
  return n;
}
export * as barDarts from './darts.js';
export * as barCheckers from './checkers.js';
export * as barPool from './pool.js';
export interface GameReady {
  players: darts.Player[];
  expiresAt: number;
  startsAt: number | null;
  cancelled: boolean;
}
export interface GameParticipant {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}
export interface BarGameSnapshot {
  id: string;
  kind: BarGameId;
  character: GameCharacter | null;
  player: darts.Player;
  participants: GameParticipant[];
  runtime: Runtime;
  ready: GameReady | null;
  serverNow: number;
}
export interface BarGameCommand {
  requestId: string;
  revision: number;
  action: BarGameAction | { type: 'ready' };
}
export interface BarGameInvite {
  id: string;
  kind: BarGameId;
  senderId: string;
  receiverId: string;
  senderName: string;
  receiverName: string;
  status: string;
  matchId: string | null;
  expiresAt: number;
}
export interface BarGameLobby {
  matchId: string | null;
  searching: BarGameId | null;
  expiresAt: number | null;
  invites: BarGameInvite[];
  serverNow: number;
}
