import { AccessibleModal } from '../../components/AccessibleModal.js';
import { gameClose } from './GameModals.js';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import {
  POOL_STROKE_MS,
  CHECKERS_STEP_MS,
  type CheckersMotion,
  type Runtime,
  DART_FLIGHT_MS,
  DART_IMPACT_MS,
  type barDarts,
  barCheckers,
  barPool,
  type BarGameAction,
} from '@hockey/game-core';
import { checkersFrame } from './checkersMotion.js';
import { MovingChecker } from './MovingChecker.js';
type Send = (action: BarGameAction) => void;
const numbers = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const point = (r: number, a: number) => `${150 + r * Math.sin(a)},${150 - r * Math.cos(a)}`;
function wedge(inner: number, outer: number, index: number) {
  const a = ((index - 0.5) * Math.PI) / 10,
    b = ((index + 0.5) * Math.PI) / 10;
  return `M ${point(inner, a)} L ${point(outer, a)} A ${outer} ${outer} 0 0 1 ${point(outer, b)} L ${point(inner, b)} A ${inner} ${inner} 0 0 0 ${point(inner, a)} Z`;
}
export function DartsField({
  game,
  lastDart,
  dartHits,
  animationStart = 0,
  now = Infinity,
  disabled,
  send,
}: {
  game: barDarts.Game;
  lastDart: barDarts.Point | null;
  dartHits?: barDarts.Point[] | undefined;
  animationStart?: number;
  now?: number;
  disabled: boolean;
  send: Send;
}) {
  const elapsed = Math.max(0, now - animationStart);
  const flightClock = useRef({ start: animationStart, delay: elapsed });
  if (flightClock.current.start !== animationStart)
    flightClock.current = { start: animationStart, delay: elapsed };
  const flying = !!lastDart && elapsed < DART_FLIGHT_MS;
  const hits = dartHits ?? (game.hits.length ? game.hits : lastDart ? [lastDart] : []);
  const visiblePoint = (p: barDarts.Point) => ({
    x: Math.max(-1.25, Math.min(1.25, p.x)),
    y: Math.max(-1.25, Math.min(1.25, p.y)),
  });
  const landing = lastDart ? visiblePoint(lastDart) : null;
  const visibleHits = (flying ? hits.slice(0, -1) : hits).map(visiblePoint);
  const start = useRef<{ x: number; y: number; time: number; id: number } | null>(null);
  const release = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    start.current = null;
    if (!s || s.id !== e.pointerId || disabled) return;
    const w = e.currentTarget.getBoundingClientRect().width;
    const dt = performance.now() - s.time;
    if (dt < 40 || dt > 5000 || e.clientY >= s.y - 8) return;
    send({
      type: 'dart',
      gesture: { dx: (e.clientX - s.x) / w, dy: (e.clientY - s.y) / w, durationMs: dt },
    });
  };
  return (
    <div
      className="bar-darts-field"
      onPointerDown={(e) => {
        if (disabled || !e.isPrimary) return;
        start.current = { x: e.clientX, y: e.clientY, time: performance.now(), id: e.pointerId };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerUp={release}
      onPointerCancel={() => {
        start.current = null;
      }}
    >
      <svg
        className="bar-dartboard"
        preserveAspectRatio="xMidYMin meet"
        viewBox="0 0 300 300"
        role="img"
        aria-label="Мишень для дартса"
      >
        <defs>
          <radialGradient id="dart-rim">
            <stop stopColor="#373a36" />
            <stop offset="1" stopColor="#151c1b" />
          </radialGradient>
        </defs>
        <circle cx="150" cy="150" r="140" fill="url(#dart-rim)" stroke="#b8aa82" strokeWidth="2" />
        {numbers.map((n, i) => (
          <g key={n}>
            {[
              [0.094, 0.56],
              [0.56, 0.63],
              [0.63, 0.94],
              [0.94, 1],
            ].map(([inner, outer], j) => (
              <path
                key={j}
                d={wedge(inner! * 111, outer! * 111, i)}
                fill={j % 2 === 1 ? (i % 2 ? '#a93632' : '#276850') : i % 2 ? '#d8caa0' : '#222d29'}
                stroke="#b8b294"
                strokeWidth=".55"
              />
            ))}
            <text
              x={150 + 126 * Math.sin((i * Math.PI) / 10)}
              y={154 - 126 * Math.cos((i * Math.PI) / 10)}
              fill="#eee5ca"
              textAnchor="middle"
              fontSize="13"
            >
              {n}
            </text>
          </g>
        ))}
        <circle
          cx="150"
          cy="150"
          r={111 * 0.094}
          fill="#276850"
          stroke="#b8b294"
          strokeWidth=".7"
        />
        <circle
          cx="150"
          cy="150"
          r={111 * 0.037}
          fill="#b93d36"
          stroke="#b8b294"
          strokeWidth=".7"
        />
        {visibleHits.map((p, i) => (
          <g key={i} transform={`translate(${150 + p.x * 111} ${150 + p.y * 111}) rotate(-28)`}>
            <g
              className={
                i === hits.length - 1 && elapsed < DART_FLIGHT_MS + DART_IMPACT_MS
                  ? 'bar-dart-impact'
                  : undefined
              }
            >
              <image
                href="/bar/games/dart-embedded-v1.webp"
                x="-5.1"
                y="0"
                width="10.2"
                height="44"
                transform="rotate(180)"
              />
            </g>
          </g>
        ))}
        {flying && landing && (
          <g transform={`translate(${150 + landing.x * 111} ${150 + landing.y * 111})`}>
            <g
              key={animationStart}
              className="bar-dart-flight"
              style={
                {
                  '--dart-x': `${-landing.x * 111}px`,
                  '--dart-y': `${330 - landing.y * 111}px`,
                  animationDuration: `${DART_FLIGHT_MS}ms`,
                  animationDelay: `-${Math.min(flightClock.current.delay, DART_FLIGHT_MS)}ms`,
                } as CSSProperties
              }
            >
              <image
                href="/bar/games/dart-flight-v1.webp"
                x="-6.1"
                y="0"
                width="12.2"
                height="48"
              />
            </g>
          </g>
        )}
      </svg>
      <div
        className="bar-darts-throw"
        aria-label="Область броска"
        style={{ opacity: flying ? 0 : 1 }}
      >
        <svg viewBox="0 0 100 150" aria-hidden="true">
          <image href="/bar/games/dart-flight-v1.webp" x="32.2" y="5" width="35.6" height="140" />
        </svg>
      </div>
    </div>
  );
}
export function CheckersField({
  game,
  disabled,
  send,
  player = 0,
  motion = null,
  animationStart = 0,
  now = 0,
}: {
  motion?: CheckersMotion | null;
  animationStart?: number;
  now?: number;
  game: barCheckers.Game;
  disabled: boolean;
  send: Send;
  player?: 0 | 1;
}) {
  const [path, setPath] = useState<number[]>([]);
  const [local, setLocal] = useState<{
    data: CheckersMotion;
    startedAt: number;
    origin: string;
    fullPath: number[];
    final: boolean;
  } | null>(null);
  const acceptedAt = useRef<number | null>(null);
  const gameKey = game.board.join(',');
  useEffect(() => setPath([]), [gameKey, game.turn]);
  const matchesSubmission = !!(
    local?.final &&
    motion &&
    motion.actor === player &&
    motion.board.join(',') === local.origin &&
    motion.path.join(',') === local.fullPath.join(',')
  );
  if (matchesSubmission && acceptedAt.current === null) acceptedAt.current = animationStart;
  const accepted = matchesSubmission && acceptedAt.current === animationStart;
  const localApplicable = !!local && (local.origin === gameKey || accepted);
  const localActive = localApplicable && now < local!.startedAt + local!.data.durationMs;
  const useLocal = localApplicable && (localActive || accepted || (local!.final && disabled));
  const preview =
    path.length > 1
      ? checkersFrame(
          {
            board: game.board,
            path,
            actor: game.turn,
            durationMs: 1,
          },
          game.white,
          1,
        ).board
      : game.board;
  const remoteActive = motion && now >= animationStart && now < animationStart + motion.durationMs;
  const visual = useLocal
    ? checkersFrame(local!.data, game.white, now - local!.startedAt)
    : remoteActive && !accepted
      ? checkersFrame(motion, game.white, now - animationStart)
      : { board: preview, moving: null };
  const motionId = `${useLocal ? local!.startedAt : animationStart}:${visual.moving?.step}`;
  const legal = barCheckers.moves(game);
  const available = legal.filter((m) => path.every((x, i) => x === m[i]));
  const destinations = available.map((m) => m[path.length]);
  const click = (i: number) => {
    if (disabled || visual.moving) return;
    if (path.length > 1 && !destinations.includes(i)) return;
    if (!path.length || (!destinations.includes(i) && legal.some((m) => m[0] === i))) {
      if (legal.some((m) => m[0] === i)) {
        setPath([i]);
        setLocal(null);
      }
      return;
    }
    const next = [...path, i];
    const candidates = available.filter((m) => m[path.length] === i);
    if (!candidates.length) return;
    const final = candidates.some((m) => m.length === next.length);
    acceptedAt.current = null;
    setLocal({
      data: {
        board: [...preview],
        path: [path[path.length - 1]!, i],
        actor: game.turn,
        durationMs: CHECKERS_STEP_MS,
      },
      origin: gameKey,
      fullPath: next,
      startedAt: now,
      final,
    });
    if (final) {
      send({ type: 'checkers', path: next });
      setPath([]);
    } else setPath(next);
  };
  // Keep the local player's pieces at the bottom, regardless of assigned white.
  const flipped = player !== game.white;
  const board = visual.board;
  return (
    <div className="bar-checkers-surround">
      <div className="bar-checkers" role="group" aria-label="Шашечная доска">
        {Array.from({ length: 64 }, (_, index) => {
          const i = flipped ? 63 - index : index,
            p = board[i]!;
          const white = p && (p > 0 ? 0 : 1) === game.white;
          return (
            <button
              key={i}
              className={`bar-checkers__cell ${(i + (i >> 3)) % 2 ? 'bar-checkers__cell--dark' : ''} ${path[path.length - 1] === i ? 'is-selected' : ''} ${path.length && destinations.includes(i) ? 'is-target' : ''}`}
              aria-label={`Клетка ${i + 1}`}
              aria-pressed={path[path.length - 1] === i}
              disabled={disabled || !!visual.moving}
              onClick={() => click(i)}
            >
              {p !== 0 && (
                <span
                  className={`bar-checker ${white ? 'bar-checker--white' : ''}`}
                  aria-label={`${white ? 'Белая' : 'Чёрная'} ${Math.abs(p) === 2 ? 'дамка' : 'шашка'}`}
                >
                  {Math.abs(p) === 2 ? '♛' : ''}
                </span>
              )}
            </button>
          );
        })}
        {visual.moving && (
          <MovingChecker
            motion={visual.moving}
            flipped={flipped}
            id={motionId}
            white={(visual.moving.piece > 0 ? 0 : 1) === game.white}
          />
        )}
      </div>
    </div>
  );
}
const colors = [
  '#f8f3dd',
  '#d6ad22',
  '#2259a0',
  '#b62c24',
  '#733e89',
  '#df7525',
  '#2b7651',
  '#8d3731',
  '#151a1d',
];
function PoolBall({ ball }: { ball: barPool.Ball }) {
  const previousPocketed = useRef(ball.pocketed);
  const [falling, setFalling] = useState<barPool.Ball | null>(null);
  useEffect(() => {
    const newlyPocketed = ball.pocketed && !previousPocketed.current;
    previousPocketed.current = ball.pocketed;
    if (!newlyPocketed) {
      if (!ball.pocketed) setFalling(null);
      return;
    }
    setFalling(ball);
    const timer = setTimeout(() => setFalling(null), 350);
    return () => clearTimeout(timer);
  }, [ball.pocketed]);
  if (ball.pocketed && !falling) return null;
  const position = falling ?? ball;
  const pocket = barPool.POCKETS.reduce((best, p) =>
    Math.hypot(position.x - p.x, position.y - p.y) <
    Math.hypot(position.x - best.x, position.y - best.y)
      ? p
      : best,
  );
  const b = { ...position, x: 0, y: 0 };
  return (
    <g transform={`translate(${position.x} ${position.y})`}>
      <g
        className={falling ? 'bar-pool-ball-sink' : undefined}
        style={
          {
            '--sink-x': `${pocket.x - position.x}px`,
            '--sink-y': `${pocket.y - position.y}px`,
          } as CSSProperties
        }
      >
        <circle cx={b.x + 0.003} cy={b.y + 0.006} r={barPool.R} fill="#001b17" opacity=".45" />
        <circle
          cx={b.x}
          cy={b.y}
          r={barPool.R}
          fill={b.id === 0 || b.id > 8 ? '#eee9d5' : colors[b.id]}
        />
        {b.id > 8 && (
          <path
            d={`M${b.x - barPool.R * 0.94} ${b.y - 0.01} Q${b.x} ${b.y - 0.02} ${b.x + barPool.R * 0.94} ${b.y - 0.01} L${b.x + barPool.R * 0.94} ${b.y + 0.01} Q${b.x} ${b.y + 0.02} ${b.x - barPool.R * 0.94} ${b.y + 0.01} Z`}
            fill={colors[b.id - 8]}
          />
        )}
        <circle cx={b.x} cy={b.y} r={barPool.R} fill="url(#ball-shine)" />
        {b.id > 0 && (
          <>
            <circle cx={b.x} cy={b.y} r=".011" fill="#f9f3de" />
            <text x={b.x} y={b.y + 0.005} fontSize=".014" textAnchor="middle" fill="#172421">
              {b.id}
            </text>
          </>
        )}
      </g>
    </g>
  );
}
function PoolSpinPicker({
  spin,
  change,
  close,
}: {
  spin: barDarts.Point;
  change: (p: barDarts.Point) => void;
  close: () => void;
}) {
  const clamp = (x: number, y: number) => {
    const scale = Math.max(1, Math.hypot(x, y) / 0.85);
    change({ x: x / scale, y: y / scale });
  };
  const pick = (e: PointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    clamp(
      (e.clientX - r.left - r.width / 2) / (r.width / 2),
      (e.clientY - r.top - r.height / 2) / (r.height / 2),
    );
  };
  return (
    <AccessibleModal
      title="Точка удара"
      onRequestClose={close}
      headerAction={gameClose(close)}
      cardClassName="bar-pool-spin-modal"
    >
      <p className="modal-copy" id="pool-spin-help">
        Выше центра – накат, ниже – оттяжка. По бокам – боковое вращение.
      </p>
      <button
        className="bar-pool-spin-target"
        aria-label="Точка удара по битку"
        aria-describedby="pool-spin-help"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pick(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons) pick(e);
        }}
        onKeyDown={(e) => {
          const delta: Record<string, barDarts.Point> = {
            ArrowLeft: { x: -0.1, y: 0 },
            ArrowRight: { x: 0.1, y: 0 },
            ArrowUp: { x: 0, y: -0.1 },
            ArrowDown: { x: 0, y: 0.1 },
          };
          const d = delta[e.key];
          if (d) {
            e.preventDefault();
            clamp(spin.x + d.x, spin.y + d.y);
          }
          if (e.key === 'Home') {
            e.preventDefault();
            change({ x: 0, y: 0 });
          }
        }}
      >
        <span className="bar-pool-spin-cross" />
        <span
          className="bar-pool-spin-dot"
          style={{ left: `${50 + spin.x * 50}%`, top: `${50 + spin.y * 50}%` }}
        />
      </button>
      <div className="modal-actions">
        <button className="btn btn--ghost" onClick={() => change({ x: 0, y: 0 })}>
          В центр
        </button>
        <button className="modal-primary btn--cta" onClick={close}>
          Готово
        </button>
      </div>
    </AccessibleModal>
  );
}
export function PoolField({
  game,
  balls,
  disabled,
  send,
  aim,
  shot,
  animationStart = 0,
  now = Infinity,
  opponent = false,
}: {
  aim?: Runtime['poolAim'];
  shot?: Runtime['poolShot'];
  animationStart?: number;
  now?: number;
  opponent?: boolean;
  game: barPool.Game;
  balls: barPool.Ball[];
  disabled: boolean;
  send: Send;
}) {
  const [angle, setAngle] = useState(-Math.PI / 2),
    [power, setPower] = useState(0);
  const [spin, setSpin] = useState<barDarts.Point>({ x: 0, y: 0 });
  const [spinOpen, setSpinOpen] = useState(false);
  const powerValue = useRef(0);
  const powerDrag = useRef<{ x: number; width: number; id: number } | null>(null);
  const updatePower = (value: number) => {
    powerValue.current = value;
    setPower(value);
  };
  useEffect(() => {
    if (disabled || game.ballInHand) {
      setSpinOpen(false);
      powerDrag.current = null;
      updatePower(0);
    }
  }, [disabled, game.ballInHand]);
  const svg = useRef<SVGSVGElement>(null);
  const fired = useRef(false);
  useEffect(() => {
    setAngle(-Math.PI / 2 + Math.sin(game.balls[0]!.x * 71 + game.turn * 13) * 0.15);
    fired.current = false;
    powerValue.current = 0;
    setPower(0);
  }, [game.balls.map((b) => `${b.x}:${b.y}:${b.pocketed}`).join(','), game.turn, game.ballInHand]);
  useEffect(() => {
    if (!disabled && !game.ballInHand && aim?.actor !== game.turn)
      send({ type: 'aim', angle, power: Math.max(0.03, power), spin });
  }, [disabled, game.ballInHand, game.turn, aim?.actor]);
  const strokeClock = useRef({ start: animationStart, delay: Math.max(0, now - animationStart) });
  if (strokeClock.current.start !== animationStart)
    strokeClock.current = { start: animationStart, delay: Math.max(0, now - animationStart) };
  const stroking = !!shot && now >= animationStart && now < animationStart + POOL_STROKE_MS + 500;
  const cue = stroking ? shot.cue : balls.find((b) => b.id === 0)!;
  const remoteAim = aim?.actor === game.turn ? aim : null;
  const displayAngle = stroking
    ? shot.angle
    : opponent
      ? (remoteAim?.angle ?? -Math.PI / 2)
      : angle;
  const displayPower = stroking ? shot.power : opponent ? (remoteAim?.power ?? 0.45) : power;
  const visibleSpin = stroking
    ? (shot.spin ?? { x: 0, y: 0 })
    : opponent
      ? (remoteAim?.spin ?? { x: 0, y: 0 })
      : spin;
  const cuePull = 0.045 + displayPower * 0.16;
  const dragging = useRef(false);
  const published = useRef(0);
  const select = (e: PointerEvent<SVGSVGElement>) => {
    if (disabled) return;
    const matrix = e.currentTarget.getScreenCTM();
    if (!matrix) return;
    const point = e.currentTarget.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    const { x, y } = point.matrixTransform(matrix.inverse());
    if (game.ballInHand) {
      send({ type: 'place', point: { x, y } });
      return;
    }
    const nextAngle = Math.atan2(y - cue.y, x - cue.x);
    setAngle(nextAngle);
    if (performance.now() - published.current > 300) {
      published.current = performance.now();
      send({ type: 'aim', angle: nextAngle, power: Math.max(0.03, power), spin });
    }
  };
  let length = 0.5,
    hit: barPool.Ball | undefined;
  if (displayAngle !== null) {
    const dx = Math.cos(displayAngle),
      dy = Math.sin(displayAngle);
    length = Math.min(
      dx > 0 ? (1 - barPool.R - cue.x) / dx : dx < 0 ? (barPool.R - cue.x) / dx : Infinity,
      dy > 0 ? (2 - barPool.R - cue.y) / dy : dy < 0 ? (barPool.R - cue.y) / dy : Infinity,
    );
    for (const b of balls) {
      if (b.id === 0 || b.pocketed) continue;
      const bx = b.x - cue.x,
        by = b.y - cue.y,
        projection = bx * dx + by * dy,
        perp = bx * bx + by * by - projection * projection;
      if (projection > 0 && perp < 4 * barPool.R ** 2) {
        const t = projection - Math.sqrt(4 * barPool.R ** 2 - perp);
        if (t >= 0 && t < length) {
          length = t;
          hit = b;
        }
      }
    }
  }
  const end =
    displayAngle === null
      ? cue
      : {
          x: cue.x + Math.cos(displayAngle) * Math.min(length, 0.55),
          y: cue.y + Math.sin(displayAngle) * Math.min(length, 0.55),
        };
  const cancelPullback = () => {
    powerDrag.current = null;
    updatePower(0);
    if (!disabled && !game.ballInHand) send({ type: 'aim', angle, power: 0.03, spin });
  };
  const fire = () => {
    const releasedPower = powerValue.current;
    updatePower(0);
    if (disabled || angle === null || fired.current || releasedPower < 0.03) return;
    fired.current = true;
    send({ type: 'shot', angle, power: releasedPower, spin });
    setSpin({ x: 0, y: 0 });
  };
  return (
    <div className="bar-pool-field">
      <svg
        ref={svg}
        viewBox="-.15 -.13 1.3 2.28"
        role="img"
        aria-label="Бильярдный стол"
        onPointerDown={(e) => {
          if (disabled) return;
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          select(e);
        }}
        onPointerMove={(e) => {
          if (dragging.current && !game.ballInHand) select(e);
        }}
        onPointerUp={() => {
          dragging.current = false;
          if (!disabled && !game.ballInHand)
            send({ type: 'aim', angle, power: Math.max(0.03, power), spin });
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
      >
        <defs>
          <radialGradient id="ball-shine" cx="30%" cy="25%">
            <stop stopColor="white" stopOpacity=".7" />
            <stop offset=".5" stopColor="white" stopOpacity="0" />
            <stop offset="1" stopColor="black" stopOpacity=".35" />
          </radialGradient>
        </defs>
        {/* Register the artwork using its corner pocket centers: (102, 88) and (830, 1577). */}
        <image
          href="/bar/games/billiards-table-v1.webp"
          x={-102 / 728}
          y={-88 / 744.5}
          width={933 / 728}
          height={1685 / 744.5}
          preserveAspectRatio="none"
        />
        {barPool.POCKETS.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r=".059"
            fill="#080b09"
          />
        ))}
        {!game.ballInHand && !stroking && (!disabled || (opponent && !!remoteAim)) && (
          <g
            stroke="#f4eac9"
            strokeOpacity=".4"
            strokeWidth=".003"
            strokeDasharray=".018 .014"
            fill="none"
          >
            {length > barPool.R + 0.018 && (
              <path
                d={`M${cue.x + Math.cos(displayAngle) * (barPool.R + 0.018)} ${cue.y + Math.sin(displayAngle) * (barPool.R + 0.018)} L${end.x} ${end.y}`}
              />
            )}
            {hit && length <= 0.55 && (
              <path
                d={`M${hit.x} ${hit.y} l${((hit.x - end.x) / Math.hypot(hit.x - end.x, hit.y - end.y)) * 0.18} ${((hit.y - end.y) / Math.hypot(hit.x - end.x, hit.y - end.y)) * 0.18}`}
              />
            )}
          </g>
        )}
        {balls.map((ball) => (
          <PoolBall key={ball.id} ball={ball} />
        ))}
        {shot &&
          now >= animationStart + POOL_STROKE_MS &&
          now < animationStart + POOL_STROKE_MS + 300 && (
            <g
              className="bar-pool-impact"
              key={animationStart}
              transform={`translate(${shot.cue.x} ${shot.cue.y})`}
              pointerEvents="none"
            >
              <circle
                className="bar-pool-impact-ring"
                r=".035"
                fill="none"
                stroke="#fff2c8"
                strokeWidth=".005"
              />
              <circle className="bar-pool-impact-flash" r=".02" fill="#fff6db" />
            </g>
          )}
        {(stroking || !game.ballInHand) && (!disabled || stroking || (opponent && !!remoteAim)) && (
          <g className="bar-pool-cue" transform={`translate(${cue.x} ${cue.y})`}>
            <g
              className="bar-pool-cue-angle"
              style={{
                transform: `rotate(${(displayAngle * 180) / Math.PI}deg)`,
                transition: opponent && !stroking ? 'transform 280ms ease-out' : 'none',
              }}
            >
              <g
                key={stroking ? animationStart : 'aim'}
                className={stroking ? 'bar-pool-stroke' : undefined}
                style={
                  {
                    '--cue-contact': `${cuePull - barPool.R}px`,
                    ...(stroking
                      ? {
                          animationDelay: `-${Math.min(strokeClock.current.delay, POOL_STROKE_MS + 500)}ms`,
                        }
                      : {}),
                  } as CSSProperties
                }
              >
                <g className="bar-pool-cue-body" transform={`translate(${-cuePull} 0)`}>
                  <path
                    d="M0 -.004 L-.73 -.014 Q-.745 0 -.73 .014 L0 .004Z"
                    fill="#261d16"
                    stroke="#211a14"
                    strokeWidth=".004"
                  />
                  <path d="M-.018 -.004 L-.48 -.010 L-.48 .010 L-.018 .004Z" fill="#dbb77b" />
                  <path d="M-.035 -.002 L-.47 -.006" stroke="#f2d69e" strokeWidth=".002" />
                  <path d="M-.48 -.010 L-.71 -.013 L-.71 .013 L-.48 .010Z" fill="#70412a" />
                  <path
                    d="M-.49 -.009 L-.52 0 L-.49 .009 M-.60 -.011 L-.63 0 L-.60 .011"
                    fill="none"
                    stroke="#bc9158"
                    strokeWidth=".003"
                  />
                  <path d="M-.018 0 L-.006 0" stroke="#f3e5ca" strokeWidth=".009" />
                  <path d="M-.006 0 L0 0" stroke="#76b9b6" strokeWidth=".01" />
                  <path d="M-.722 0 L-.738 0" stroke="#211b18" strokeWidth=".026" />
                </g>
              </g>
            </g>
          </g>
        )}
      </svg>
      <div className="bar-pool-controls">
        <label className="bar-pool-power bar-pool-power--pull">
          <span>
            Оттяни и отпусти <strong>{Math.round(displayPower * 100)}%</strong>
          </span>
          <input
            type="range"
            dir="rtl"
            aria-label="Сила удара"
            min="0"
            max="100"
            value={Math.round(power * 100)}
            disabled={disabled || game.ballInHand}
            onPointerDown={(e) => {
              if (disabled || game.ballInHand) return;
              e.preventDefault();
              e.currentTarget.focus();
              e.currentTarget.setPointerCapture(e.pointerId);
              powerDrag.current = {
                x: e.clientX,
                width: e.currentTarget.getBoundingClientRect().width,
                id: e.pointerId,
              };
              fired.current = false;
              updatePower(0);
              send({ type: 'aim', angle, power: 0.03, spin });
            }}
            onPointerMove={(e) => {
              const drag = powerDrag.current;
              if (!drag || drag.id !== e.pointerId || disabled) return;
              const value = Math.max(
                0,
                Math.min(1, (drag.x - e.clientX) / Math.max(1, drag.width)),
              );
              updatePower(value);
              if (performance.now() - published.current > 300) {
                published.current = performance.now();
                send({ type: 'aim', angle, power: Math.max(0.03, value), spin });
              }
            }}
            onPointerUp={(e) => {
              if (powerDrag.current?.id !== e.pointerId) return;
              powerDrag.current = null;
              fire();
            }}
            onPointerCancel={cancelPullback}
            onLostPointerCapture={() => {
              if (powerDrag.current) cancelPullback();
            }}
            onChange={(e) => {
              fired.current = false;
              updatePower(Number(e.target.value) / 100);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                fire();
              }
              if (e.key === 'Escape') cancelPullback();
            }}
          />
        </label>
        <button
          className="bar-pool-spin-button"
          aria-label="Выбрать точку удара"
          disabled={disabled || game.ballInHand}
          onClick={() => setSpinOpen(true)}
        >
          <span className="bar-pool-spin-ball">
            <span
              className="bar-pool-spin-dot"
              style={{ left: `${50 + visibleSpin.x * 50}%`, top: `${50 + visibleSpin.y * 50}%` }}
            />
          </span>
        </button>
      </div>
      {spinOpen && (
        <PoolSpinPicker
          spin={spin}
          change={(point) => {
            setSpin(point);
            send({ type: 'aim', angle, power: Math.max(0.03, power), spin: point });
          }}
          close={() => setSpinOpen(false)}
        />
      )}
    </div>
  );
}
