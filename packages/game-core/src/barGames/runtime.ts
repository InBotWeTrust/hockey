import * as darts from './darts.js';
import * as checkers from './checkers.js';
import * as pool from './pool.js';
import * as ochko from './ochko.js';
import * as sea from './battleship.js';
import * as series from './ochkoSeries.js';
import * as arm from './armwrestling.js';
export type BarGameId =
  | 'darts'
  | 'billiards'
  | 'checkers'
  | 'ochko'
  | 'armwrestling'
  | 'battleship';
export type BarGame =
  | darts.Game
  | checkers.Game
  | pool.Game
  | ochko.OchkoView
  | arm.ArmState
  | sea.View;
export type BarGameAction =
  | { type: 'dart'; gesture: darts.Gesture }
  | { type: 'checkers'; path: number[] }
  | { type: 'place'; point: darts.Point }
  | ({ type: 'shot' } & pool.Shot)
  | ({ type: 'aim' } & pool.Shot)
  | { type: 'ochko-hit' | 'ochko-stand'; seq: number; round?: number | undefined }
  | ({ type: 'arm-input' } & arm.ArmInput)
  | { type: 'ochko-next' | 'ochko-challenge'; round: number }
  | { type: 'naval-configure'; shipId: string; x: number; y: number; vertical: boolean }
  | { type: 'naval-shuffle'; seed: number }
  | { type: 'naval-deploy'; shipId: string; seed: number }
  | { type: 'naval-attack'; x: number; y: number; salvo: boolean; vertical: boolean }
  | { type: 'naval-move'; x: number; y: number }
  | { type: 'surrender' };
export const ENGINE_VERSION = 16;
export const CHECKERS_STEP_MS = 450;
export const TURN_MS = 40000;
export const DART_FLIGHT_MS = 700;
export const DART_IMPACT_MS = 350;
export const DART_SPIN_MS = 1200;
export const POOL_STROKE_MS = 800;
const POOL_AIM_MS = 1200;
function supportedVersion(version: number): boolean {
  return (
    version === 1 ||
    version === 2 ||
    version === 3 ||
    version === 4 ||
    version === 5 ||
    version === 6 ||
    version === 7 ||
    version === 8 ||
    version === 9 ||
    version === 10 ||
    version === 11 ||
    version === 12 ||
    version === 13 ||
    version === 14 ||
    version === 15 ||
    version === ENGINE_VERSION
  );
}
function botPause(m: Runtime, continuingDarts = false): number {
  if (m.engineVersion === 1) return m.game.kind === 'checkers' ? 900 : 1800;
  if (continuingDarts) return 1800;
  const thinking = 3000 + Math.floor(random(m) * 2001);
  // Visible aiming is part of Veronika's total thinking time before the stroke.
  return thinking - (m.game.kind === 'billiards' ? POOL_AIM_MS : 0);
}
export const CHARACTER_GAME = {
  // Kept for snapshots of existing Maria darts matches. New launches use Daria.
  maria: 'darts',
  daria: 'darts',
  veronika: 'billiards',
  arsenich: 'checkers',
  grigory: 'ochko',
  oleg: 'armwrestling',
  timofey: 'battleship',
} as const;
export type GameCharacter = keyof typeof CHARACTER_GAME;
export interface BarGameFeedback {
  type: 'dart' | 'checkers' | 'shot' | 'place' | 'timeout' | 'naval-attack' | 'naval-move';
  actor: darts.Player;
  points?: number;
  bust?: boolean;
  captured?: number;
  pocketed?: number[];
  foul?: boolean;
}
export interface CheckersMotion {
  board: number[];
  path: number[];
  actor: darts.Player;
  durationMs: number;
}
function checkersMotion(m: Runtime, path: number[]): CheckersMotion {
  return {
    board: [...(m.game.kind === 'checkers' ? m.game.board : [])],
    path: [...path],
    actor: m.game.turn,
    durationMs: m.engineVersion >= 3 ? (path.length - 1) * CHECKERS_STEP_MS : 350,
  };
}
export interface Runtime {
  checkersMove?: CheckersMotion | null;
  feedback?: BarGameFeedback;
  engineVersion: number;
  botAt?: number;
  game: BarGame;
  deadline: number;
  animationUntil: number;
  missed: [number, number];
  computer: boolean;
  seed: number;
  reason: 'played' | 'surrender' | 'inactivity' | 'technical' | null;
  lastDart: darts.Point | null;
  dartHits?: darts.Point[];
  dartRotation?: { from: number; to: number; start: number; until: number };
  poolAim?: (pool.Shot & { actor: darts.Player }) | null;
  poolShot?: (pool.Shot & { cue: darts.Point }) | null;
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
  version = ENGINE_VERSION,
): Runtime {
  const match: Runtime = {
    engineVersion: version,
    game:
      kind === 'battleship'
        ? (sea.create(starter, seed, version >= 15) as unknown as sea.View)
        : kind === 'armwrestling'
          ? arm.createArmwrestling(now, seed)
          : kind === 'ochko'
            ? version >= 12
              ? createSeries(seed, now, computer)
              : ochko.createOchko(seed, now)
            : kind === 'darts'
              ? darts.create(starter)
              : kind === 'checkers'
                ? checkers.create(starter)
                : pool.create(starter),
    deadline: now + (kind === 'battleship' && version >= 14 ? 30000 : TURN_MS),
    animationUntil: now,
    missed: [0, 0],
    computer,
    seed,
    reason: null,
    lastDart: null,
    poolFrames: [],
    animationStart: now,
    revision: 0,
  };
  if (kind === 'armwrestling') {
    match.deadline = now;
    match.botAt = now;
    return match;
  }
  if (kind === 'ochko') {
    match.animationUntil = now + (version >= 12 ? 1400 : ochko.OCHKO_DEAL_MS * 2);
    match.botAt = match.animationUntil + 3000 + Math.floor(random(match) * 2001);
    match.deadline = Math.min(...(match.game as ochko.OchkoView).deadlines);
    return version >= 12 ? seriesRuntime(match, match.game as series.State, now) : match;
  }
  if (computer && starter === 1) match.animationUntil += botPause(match);
  return match;
}
function spinDartboard(m: Runtime, start: number): void {
  if (m.game.kind !== 'darts') return;
  const from = m.game.boardAngle ?? 0;
  const to = from + 378 + Math.floor(random(m) * 325);
  m.game = { ...m.game, boardAngle: to };
  m.dartRotation = { from, to, start, until: start + DART_SPIN_MS };
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
    checkersMove: null,
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
    n.lastDart = darts.aim(
      action.gesture,
      n.engineVersion >= 4 ? darts.SWIPE_GAIN : darts.LEGACY_SWIPE_GAIN,
    );
    n.game = darts.hit(
      m.game,
      n.lastDart,
      n.engineVersion >= 9 && n.engineVersion <= 10,
      n.engineVersion >= 9,
    );
    n.feedback = {
      type: 'dart',
      actor: p,
      points: n.game.lastScore,
      bust: n.engineVersion >= 9 ? !!n.game.lastBust : n.game.lastScore > m.game.scores[p],
    };
    n.dartHits = [...m.game.hits, n.lastDart];
    duration = DART_FLIGHT_MS + DART_IMPACT_MS;
    if (n.engineVersion >= 9 && n.game.turn !== p && n.game.winner === null) {
      spinDartboard(n, now + duration);
      duration += DART_SPIN_MS;
    }
  } else if (m.game.kind === 'checkers' && action.type === 'checkers') {
    n.game = checkers.move(m.game, action.path);
    n.feedback = {
      type: 'checkers',
      actor: p,
      captured: m.game.board.filter(Boolean).length - n.game.board.filter(Boolean).length,
    };
    n.checkersMove = checkersMotion(m, action.path);
    duration = n.checkersMove.durationMs;
  } else if (m.game.kind === 'billiards' && action.type === 'place') {
    n.game = pool.place(m.game, action.point);
    n.poolShot = null;
    n.poolAim = null;
    n.feedback = { type: 'place', actor: p };
    return n;
  } else if (m.game.kind === 'billiards' && action.type === 'shot') {
    const sim = pool.shoot(m.game, action, m.engineVersion >= 6 ? 'responsive' : 'classic');
    n.poolAim = null;
    const cue = m.game.balls.find((b) => b.id === 0)!;
    n.poolShot = { ...action, cue: { x: cue.x, y: cue.y } };
    n.game = sim.game;
    n.poolFrames = sim.frames;
    n.feedback = {
      type: 'shot',
      actor: p,
      pocketed: sim.pocketed.filter((id) => id !== 0),
      foul: sim.game.lastFoul,
    };
    duration = sim.durationMs + POOL_STROKE_MS;
  } else throw new Error('Wrong game action');
  if (manual) n.missed[p] = 0;
  n.animationUntil =
    now +
    duration +
    (n.computer && n.game.turn === 1 && (n.engineVersion === 1 || n.game.winner === null)
      ? botPause(n, n.game.kind === 'darts' && n.game.turn === p)
      : 0);
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
  if (!supportedVersion(m.engineVersion) || m.game.winner !== null)
    throw new Error('Inactive game');
  if (action.type === 'surrender')
    return {
      ...m,
      game: { ...m.game, winner: player === 0 ? 1 : 0 },
      reason: 'surrender',
      revision: m.revision + 1,
    };
  if (m.game.kind === 'armwrestling') {
    if (action.type !== 'arm-input') throw new Error('Wrong game action');
    const game = arm.applyArmInput(m.game, player, action, now);
    return game === m.game ? m : armRuntime(m, game, now);
  }
  if (m.game.kind === 'battleship') {
    const g = privateSea(m.game);
    let game: sea.State;
    if (action.type === 'naval-deploy') game = sea.deploy(g, player, action.shipId, action.seed);
    else if (action.type === 'naval-configure')
      game = sea.configure(g, player, action.shipId, action.x, action.y, action.vertical);
    else if (action.type === 'naval-shuffle') {
      if (g.phase !== 'setup') throw Error('Fleet locked');
      game = { ...g, fleets: [...g.fleets] };
      game.fleets[player] = sea.fleet(action.seed);
    } else {
      if (now >= m.deadline || now < m.animationUntil) throw Error('Not your turn');
      if (action.type === 'naval-attack')
        game = sea.attack(g, player, action.x, action.y, action.salvo, action.vertical, m.engineVersion >= 13);
      else if (action.type === 'naval-move') game = sea.move(g, player, action.x, action.y);
      else throw Error('Wrong game action');
    }
    const missed: [number, number] = [...m.missed];
    missed[player] = 0;
    return {
      ...m,
      seed: (Math.imul(m.seed, 1664525) + 1013904223) >>> 0,
      game: game as unknown as sea.View,
      missed,
      animationStart: now,
      ...(game.lastAction
        ? {
            feedback: {
              type:
                game.lastAction.type === 'attack'
                  ? ('naval-attack' as const)
                  : ('naval-move' as const),
              actor: player,
              points: game.lastAction.cells.filter((c) => c.hit).length,
            },
          }
        : {}),
      revision: m.revision + 1,
      deadline: now + (m.engineVersion >= 14 ? 30000 : TURN_MS),
      animationUntil: now + (m.computer && game.turn === 1 ? 3000 : 0),
      reason: game.winner !== null ? 'played' : null,
    };
  }
  if (m.game.kind === 'ochko' && m.engineVersion >= 12) {
    if (
      !['ochko-hit', 'ochko-stand', 'ochko-next', 'ochko-challenge'].includes(action.type) ||
      !('round' in action) ||
      action.round === undefined
    )
      throw Error('Wrong series command');
    if (
      (action.type === 'ochko-hit' || action.type === 'ochko-stand') &&
      action.seq !== m.game.actionSeq[player] + 1
    )
      throw Error('Stale hand command');
    const a =
      action.type === 'ochko-hit'
        ? 'hit'
        : action.type === 'ochko-stand'
          ? 'stand'
          : action.type === 'ochko-next'
            ? 'next'
            : 'challenge';
    return seriesRuntime(m, series.act(m.game as series.State, player, a, action.round, now), now);
  }
  if (m.game.kind === 'ochko') {
    if (action.type !== 'ochko-hit' && action.type !== 'ochko-stand')
      throw new Error('Wrong game action');
    if (action.seq !== m.game.actionSeq[player] + 1) throw new Error('Stale hand command');
    const game = ochko.actOchko(
      privateOchko(m.game),
      player,
      action.type === 'ochko-hit' ? 'hit' : 'stand',
      now,
    );
    return ochkoRuntime(m, game, now);
  }
  if (m.game.turn !== player || now >= m.deadline || now < m.animationUntil)
    throw new Error('Not your turn');
  if (action.type === 'aim') {
    if (
      m.game.kind !== 'billiards' ||
      m.game.ballInHand ||
      !Number.isFinite(action.angle) ||
      !Number.isFinite(action.power) ||
      !pool.validSpin(action.spin) ||
      action.power < 0.03 ||
      action.power > 1
    )
      throw new Error('Invalid aim');
    return {
      ...m,
      poolAim: { ...action, actor: player },
      revision: m.revision + 1,
    };
  }
  return perform(m, action, now, true);
}
export function advance(m: Runtime, now: number): Runtime {
  if (!supportedVersion(m.engineVersion)) throw new Error('Unsupported game version');
  if (m.game.winner !== null) return m;
  if (m.game.kind === 'armwrestling') {
    let n = m,
      game = m.game;
    while (n.computer && game.winner === null && (n.botAt ?? game.startedAt) <= now) {
      const at = n.botAt ?? game.startedAt;
      const cycle = Math.floor((at - game.startedAt) / 2000);
      const tactic = (Math.imul(game.seed + cycle, 1664525) + 1013904223) >>> 0;
      const resting = game.stamina[1] < 0.22 || tactic % 7 === 0;
      game = arm.applyArmInput(
        game,
        1,
        {
          seq: game.lastSeq[1] + 1,
          supportHeld: true,
          support: resting ? 0.2 : 0.65 + (tactic % 30) / 100,
          pressing: !resting,
          wrist: resting ? 'outside' : tactic % 3 === 0 ? 'inside' : 'straight',
        },
        at,
      );
      n = { ...n, botAt: at + 250 };
    }
    game = arm.advanceArmwrestling(game, now);
    return armRuntime(n, game, now);
  }
  if (m.game.kind === 'ochko' && m.engineVersion >= 12) {
    let n = m,
      g = m.game as series.State;
    for (
      let i = 0;
      i < 36 &&
      m.computer &&
      g.series.phase === 'play' &&
      !g.done[1] &&
      Math.max(n.botAt ?? 0, g.dealUntil[1]) <= now;
      i++
    ) {
      const at = Math.max(n.botAt ?? 0, g.dealUntil[1]);
      g = series.advance(g, at);
      if (g.series.phase !== 'play' || g.done[1]) break;
      g = series.act(g, 1, g.scores[1] < 17 ? 'hit' : 'stand', g.series.round, at);
      n = { ...n, botAt: at + 3700 };
    }
    return seriesRuntime(n, series.advance(g, now), now);
  }
  if (m.game.kind === 'ochko') {
    let n = m,
      g = privateOchko(m.game);
    for (
      let i = 0;
      i < 36 && n.computer && !g.done[1] && g.winner === null && (n.botAt ?? 0) <= now;
      i++
    ) {
      const at = Math.max(n.botAt ?? g.dealUntil[1], g.dealUntil[1]);
      g = ochko.advanceOchko(g, at);
      if (g.done[1] || g.winner !== null) break;
      g = ochko.actOchko(g, 1, g.scores[1] < 17 ? 'hit' : 'stand', at);
      const next = { ...n };
      const pause = 3000 + Math.floor(random(next) * 2001);
      n = { ...next, botAt: g.dealUntil[1] + pause };
    }
    g = ochko.advanceOchko(g, now);
    return g === m.game && n === m ? m : ochkoRuntime(n, g, now);
  }
  let n = m;
  for (let i = 0; i < 64 && n.game.winner === null; i++) {
    if (n.computer && n.game.turn === 1) {
      if (now < n.animationUntil) break;
      const at = n.animationUntil;
      if (n.game.kind === 'battleship') {
        const b = sea.bot(sea.view(privateSea(n.game), 1), n.seed, n.engineVersion >= 16);
        n = command(n, 1, { type: 'naval-attack', ...b }, at);
      } else if (n.game.kind === 'checkers')
        n = perform(n, { type: 'checkers', path: checkers.bot(n.game) }, at, false);
      else if (n.game.kind === 'billiards') {
        if (n.poolAim?.actor === 1) {
          n = perform(n, { ...n.poolAim, type: 'shot' }, at, false);
        } else {
          const b = pool.bot(n.game, n.engineVersion >= 10);
          if (b.placement) n = perform(n, { type: 'place', point: b.placement }, at, false);
          n = {
            ...n,
            poolAim: { ...b.shot, actor: 1 },
            poolShot: null,
            poolFrames: [],
            animationUntil: at + (n.engineVersion === 1 ? 1800 : POOL_AIM_MS),
            revision: n.revision + 1,
          };
        }
      } else if (n.game.kind === 'darts') {
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
        if (n.engineVersion >= 5) {
          const targetPoint = darts.rotatePoint(
            darts.botTarget(n.game.scores[1], n.engineVersion >= 9 && n.engineVersion <= 10),
            n.engineVersion >= 9 ? (n.game.boardAngle ?? 0) : 0,
          );
          const imprecise = random(copy) < 0.25;
          point.x = targetPoint.x + (random(copy) - 0.5) * (imprecise ? 0.2 : 0.028);
          point.y = targetPoint.y + (random(copy) - 0.5) * (imprecise ? 0.16 : 0.025);
        }
        const gain = n.engineVersion >= 4 ? darts.SWIPE_GAIN : darts.LEGACY_SWIPE_GAIN;
        const speed = (1.6 - point.y) / gain;
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
      const checkersPath = n.game.kind === 'checkers' ? checkers.moves(n.game)[0]! : null;
      const motion = checkersPath ? checkersMotion(n, checkersPath) : null;
      const duration = motion?.durationMs ?? 0;
      const game =
        n.game.kind === 'darts'
          ? darts.timeout(n.game)
          : n.game.kind === 'billiards'
            ? pool.timeout(n.game)
            : n.game.kind === 'checkers'
              ? checkers.move(n.game, checkersPath!)
              : n.game.kind === 'battleship'
                ? { ...n.game, turn: (p === 0 ? 1 : 0) as darts.Player }
                : n.game;
      const at = n.deadline;
      n = {
        ...n,
        game,
        missed,
        revision: n.revision + 1,
        deadline: at + (n.game.kind === 'battleship' && n.engineVersion >= 14 ? 30000 : TURN_MS),
        animationStart: at,
        animationUntil: at + duration,
        checkersMove: motion,
        poolFrames: [],
        poolShot: null,
        poolAim: null,
        lastDart: null,
        feedback: { type: 'timeout', actor: p },
        reason: game.winner !== null ? 'played' : null,
      };
      if (n.engineVersion >= 9 && n.game.kind === 'darts' && n.game.winner === null) {
        spinDartboard(n, at);
        n.animationUntil += DART_SPIN_MS;
        n.deadline += DART_SPIN_MS;
      }
      if (n.computer && game.turn === 1 && (n.engineVersion === 1 || game.winner === null))
        n.animationUntil += n.engineVersion === 1 ? 900 : botPause(n);
      n.deadline += duration;
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
  stake?: { amount: number; payout: number | null };
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
  senderAvatarUrl?: string | null;
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

function privateOchko(game: ochko.OchkoView): ochko.OchkoState {
  if (!('deck' in game) || !Array.isArray(game.deck))
    throw new Error('Private ochko state required');
  return game as ochko.OchkoState;
}
function ochkoRuntime(m: Runtime, game: ochko.OchkoState, now: number): Runtime {
  const due = game.deadlines.filter((_, p) => !game.done[p]);
  if (m.computer && !game.done[1]) due.push(m.botAt ?? now);
  return {
    ...m,
    game,
    revision: m.revision + 1,
    deadline: due.length ? Math.min(...due) : now,
    animationUntil: Math.max(...game.dealUntil),
    reason: game.winner !== null ? 'played' : m.reason,
  };
}
export function publicRuntime(m: Runtime, player: darts.Player, now = 0): Runtime {
  if (m.game.kind === 'battleship')
    return { ...m, seed: 0, game: sea.view(privateSea(m.game), player) };
  if (m.game.kind === 'ochko')
    return {
      ...m,
      seed: 0,
      game:
        m.engineVersion >= 12
          ? series.view(m.game as series.State, player, now)
          : ochko.ochkoView(privateOchko(m.game), player),
    };
  return m;
}
function privateSea(g: sea.View): sea.State {
  if (!('fleets' in g)) throw Error('Private naval state required');
  return g as unknown as sea.State;
}
function createSeries(seed: number, now: number, computer: boolean) {
  const old = ochko.createOchko(seed, now);
  return series.create(
    [...old.deck, ...old.hands[1].slice().reverse(), ...old.hands[0].slice().reverse()],
    now,
    computer,
    seed,
  );
}
function seriesRuntime(m: Runtime, g: series.State, now: number): Runtime {
  const s = g.series;
  let deadline = now;
  if (s.phase === 'play') {
    const due = g.deadlines.filter((_, p) => !g.done[p]);
    if (m.computer && !g.done[1]) due.push(Math.max(m.botAt ?? 0, g.dealUntil[1]));
    deadline = Math.min(...due);
  } else if (s.phase === 'reveal') deadline = s.reviewAt;
  else if (s.phase === 'review') deadline = s.reviewUntil;
  else if (s.phase === 'countdown') deadline = s.nextAt;
  if (JSON.stringify(g) === JSON.stringify(m.game) && deadline === m.deadline) return m;
  return {
    ...m,
    game: g,
    deadline,
    animationUntil: Math.max(...g.dealUntil),
    revision: m.revision + 1,
    reason:
      g.winner === null
        ? null
        : s.technical
          ? 'technical'
          : g.series.round < 4 && now >= s.reviewUntil
            ? 'inactivity'
            : 'played',
  };
}
export * as barBattleship from './battleship.js';
export * as barOchkoSeries from './ochkoSeries.js';
export * as barOchko from './ochko.js';

function armRuntime(m: Runtime, game: arm.ArmState, now: number): Runtime {
  return {
    ...m,
    game,
    deadline: now + 250,
    animationUntil: game.winner !== null ? now + 500 : game.startedAt,
    reason:
      game.winner !== null ? (game.reason === 'inactivity' ? 'inactivity' : 'played') : m.reason,
    revision: m.revision + 1,
  };
}
export * as barArmwrestling from './armwrestling.js';
