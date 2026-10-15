import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { type barDarts, barCheckers, barPool, type BarGameAction } from '@hockey/game-core';
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
  disabled,
  send,
}: {
  game: barDarts.Game;
  lastDart: barDarts.Point | null;
  disabled: boolean;
  send: Send;
}) {
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
        {[...game.hits, ...(lastDart ? [lastDart] : [])].map((p, i) => (
          <g key={i} transform={`translate(${150 + p.x * 111} ${150 + p.y * 111}) rotate(-28)`}>
            <path d="M0 0L2 -26L-2 -26Z" fill="#d1d7d3" />
            <path d="M0 -24L-7 -37L0 -34L7 -37Z" fill="#c9b15c" stroke="#3a3d35" strokeWidth="1" />
          </g>
        ))}
      </svg>
      <div className="bar-darts-throw" aria-label="Область броска">
        <svg viewBox="0 0 100 150" aria-hidden="true">
          <path d="M50 5L46 70L54 70Z" fill="#d7dedb" />
          <rect x="44" y="65" width="12" height="35" rx="4" fill="#85918c" />
          <path d="M50 95L25 135L50 124L75 135Z" fill="#ba9a51" stroke="#3b3328" strokeWidth="2" />
        </svg>
        <span>{disabled ? 'Ход соперника' : 'Проведи дротик вверх'}</span>
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
}: {
  game: barPool.Game;
  balls: barPool.Ball[];
  disabled: boolean;
  send: Send;
}) {
  const [angle, setAngle] = useState<number | null>(null),
    [power, setPower] = useState(0.45);
  const svg = useRef<SVGSVGElement>(null);
  const fired = useRef(false);
  useEffect(() => {
    setAngle(null);
    fired.current = false;
  }, [game.balls.map((b) => `${b.x}:${b.y}:${b.pocketed}`).join(','), game.turn, game.ballInHand]);
  const cue = balls.find((b) => b.id === 0)!;
  const select = (e: PointerEvent<SVGSVGElement>) => {
    if (disabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 1.24 - 0.12,
      y = ((e.clientY - rect.top) / rect.height) * 2.24 - 0.12;
    if (game.ballInHand) {
      send({ type: 'place', point: { x, y } });
      return;
    }
    setAngle(Math.atan2(y - cue.y, x - cue.x));
  };
  let length = 0.5,
    hit: barPool.Ball | undefined;
  if (angle !== null) {
    const dx = Math.cos(angle),
      dy = Math.sin(angle);
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
    angle === null
      ? cue
      : { x: cue.x + Math.cos(angle) * length, y: cue.y + Math.sin(angle) * length };
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
        onPointerDown={select}
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
        {!disabled && angle !== null && (
          <g stroke="#f4eac9" strokeWidth=".004" strokeDasharray=".018 .014" fill="none">
            <path d={`M${cue.x} ${cue.y} L${end.x} ${end.y}`} />
            {hit && (
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
        {!disabled && angle !== null && (
          <path
            d={`M${cue.x - Math.cos(angle) * 0.08} ${cue.y - Math.sin(angle) * 0.08} l${-Math.cos(angle) * (0.3 + power * 0.1)} ${-Math.sin(angle) * (0.3 + power * 0.1)}`}
            stroke="#d1aa6a"
            strokeWidth=".012"
          />
        )}
      </svg>
      <label className="bar-pool-power">
        Сила удара
        <input
          type="range"
          aria-label="Сила удара"
          min="3"
          max="100"
          value={Math.round(power * 100)}
          disabled={disabled || angle === null}
          onPointerDown={() => {
            fired.current = false;
          }}
          onChange={(e) => setPower(Number(e.target.value) / 100)}
          onPointerUp={fire}
          onKeyUp={(e) => {
            if (e.key.startsWith('Arrow')) {
              fired.current = false;
              fire();
            }
          }}
        />
      </label>
      <p className="bar-game-hint">
        {game.ballInHand
          ? 'Выбери свободное место для битка'
          : angle === null
            ? 'Коснись стола для прицела'
            : 'Оттяни ползунок и отпусти'}
      </p>
    </div>
  );
}
