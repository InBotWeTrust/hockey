import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import {
  POOL_STROKE_MS,
  type Runtime,
  DART_FLIGHT_MS,
  DART_IMPACT_MS,
  type barDarts,
  barCheckers,
  barPool,
  type BarGameAction,
} from '@hockey/game-core';
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
}: {
  game: barCheckers.Game;
  disabled: boolean;
  send: Send;
  player?: 0 | 1;
}) {
  const [path, setPath] = useState<number[]>([]);
  useEffect(() => setPath([]), [game.board.join(','), game.turn]);
  const legal = barCheckers.moves(game);
  const available = legal.filter((m) => path.every((x, i) => x === m[i]));
  const destinations = available.map((m) => m[path.length]);
  const click = (i: number) => {
    if (disabled) return;
    if (!path.length || (!destinations.includes(i) && legal.some((m) => m[0] === i))) {
      if (legal.some((m) => m[0] === i)) setPath([i]);
      return;
    }
    const next = [...path, i];
    const candidates = available.filter((m) => m[path.length] === i);
    if (!candidates.length) return;
    if (candidates.some((m) => m.length === next.length)) {
      send({ type: 'checkers', path: next });
      setPath([]);
    } else setPath(next);
  };
  // Keep the local player's pieces at the bottom, regardless of assigned white.
  const flipped = player !== game.white;
  const board = [...game.board];
  if (path.length > 1) {
    let piece = board[path[0]!]!;
    board[path[0]!] = 0;
    for (let j = 1; j < path.length; j++) {
      const a = path[j - 1]!,
        b = path[j]!;
      const dr = Math.sign((b >> 3) - (a >> 3)),
        dc = Math.sign((b % 8) - (a % 8));
      for (let r = (a >> 3) + dr, c = (a % 8) + dc; r !== b >> 3; r += dr, c += dc)
        board[r * 8 + c] = 0;
      if (b >> 3 === (game.turn === game.white ? 0 : 7)) piece = Math.sign(piece) * 2;
    }
    board[path[path.length - 1]!] = piece;
  }
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
              disabled={disabled}
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
    [power, setPower] = useState(0.45);
  const svg = useRef<SVGSVGElement>(null);
  const fired = useRef(false);
  useEffect(() => {
    setAngle(-Math.PI / 2 + Math.sin(game.balls[0]!.x * 71 + game.turn * 13) * 0.15);
    fired.current = false;
  }, [game.balls.map((b) => `${b.x}:${b.y}:${b.pocketed}`).join(','), game.turn, game.ballInHand]);
  useEffect(() => {
    if (!disabled && !game.ballInHand && aim?.actor !== game.turn)
      send({ type: 'aim', angle, power });
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
      send({ type: 'aim', angle: nextAngle, power });
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
  const fire = () => {
    if (disabled || angle === null || fired.current) return;
    fired.current = true;
    send({ type: 'shot', angle, power });
  };
  return (
    <div className="bar-pool-field">
      <svg
        ref={svg}
        viewBox="-.12 -.12 1.24 2.24"
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
          if (!disabled && !game.ballInHand) send({ type: 'aim', angle, power });
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
      >
        <defs>
          <radialGradient id="pool-felt">
            <stop stopColor="#278b70" />
            <stop offset="1" stopColor="#105a4b" />
          </radialGradient>
          <radialGradient id="ball-shine" cx="30%" cy="25%">
            <stop stopColor="white" stopOpacity=".7" />
            <stop offset=".5" stopColor="white" stopOpacity="0" />
            <stop offset="1" stopColor="black" stopOpacity=".35" />
          </radialGradient>
        </defs>
        <rect
          x="-.12"
          y="-.12"
          width="1.24"
          height="2.24"
          rx=".07"
          fill="#543522"
          stroke="#ad7945"
          strokeWidth=".015"
        />
        <rect x="-.025" y="-.025" width="1.05" height="2.05" rx=".045" fill="#16483b" />
        <rect width="1" height="2" fill="url(#pool-felt)" />
        {barPool.POCKETS.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r=".065"
            fill="#111612"
            stroke="#674b32"
            strokeWidth=".012"
          />
        ))}
        {!game.ballInHand && !stroking && (!disabled || (opponent && !!remoteAim)) && (
          <g stroke="#f4eac9" strokeWidth=".004" strokeDasharray=".018 .014" fill="none">
            <path d={`M${cue.x} ${cue.y} L${end.x} ${end.y}`} />
            {hit && length <= 0.55 && (
              <path
                d={`M${hit.x} ${hit.y} l${((hit.x - end.x) / Math.hypot(hit.x - end.x, hit.y - end.y)) * 0.18} ${((hit.y - end.y) / Math.hypot(hit.x - end.x, hit.y - end.y)) * 0.18}`}
              />
            )}
          </g>
        )}
        {balls
          .filter((b) => !b.pocketed)
          .map((b) => (
            <g key={b.id}>
              <circle
                cx={b.x + 0.003}
                cy={b.y + 0.006}
                r={barPool.R}
                fill="#001b17"
                opacity=".45"
              />
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
      <label className="bar-pool-power">
        <span>
          Сила удара <strong>{Math.round(displayPower * 100)}%</strong>
        </span>
        <input
          type="range"
          aria-label="Сила удара"
          min="3"
          max="100"
          value={Math.round(power * 100)}
          disabled={disabled || game.ballInHand}
          onPointerDown={() => {
            fired.current = false;
          }}
          onChange={(e) => {
            const nextPower = Number(e.target.value) / 100;
            setPower(nextPower);
            if (performance.now() - published.current > 300) {
              published.current = performance.now();
              send({ type: 'aim', angle, power: nextPower });
            }
          }}
          onPointerUp={fire}
          onKeyUp={(e) => {
            if (e.key.startsWith('Arrow')) {
              fired.current = false;
              fire();
            }
          }}
        />
      </label>
    </div>
  );
}
