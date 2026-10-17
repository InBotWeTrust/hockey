/** Deterministic naval rules. Hidden fleets enter an opponent view only after the match ends. */
export type Ship = {
  id: string;
  kind: 'standard' | 'carrier' | 'submarine';
  x: number;
  y: number;
  w: number;
  h: number;
  hits: number[];
};
export type SubmarinePosition = Ship & { move: number };
type Mark = { cell: number; hit: boolean };
export type State = {
  kind: 'battleship';
  phase: 'setup' | 'battle';
  airstrikeCharges?: [number, number];
  turn: 0 | 1;
  fleets: [Ship[], Ship[]];
  moves: [number, number];
  submarineHistory?: [SubmarinePosition[], SubmarinePosition[]];
  shots: [Mark[], Mark[]];
  winner: 0 | 1 | 'draw' | null;
  lastAction: { player: 0 | 1; type: 'attack' | 'move'; cells: Mark[] } | null;
};
export type View = Omit<State, 'fleets' | 'moves' | 'shots' | 'airstrikeCharges' | 'submarineHistory'> & {
  ownShips: Ship[];
  enemySunk: Ship[];
  shots: [Mark[], Mark[]];
  movesLeft: number;
  enemyMovesLeft?: number;
  enemyReveal?: { ships: Ship[]; submarineTrail?: SubmarinePosition[] };
  canSalvo: boolean;
  airstrikeCharge?: number;
};
export const cell = (x: number, y: number) => y * 12 + x;
export const cells = (s: Ship) =>
  Array.from({ length: s.w * s.h }, (_, i) => cell(s.x + (i % s.w), s.y + Math.floor(i / s.w)));
const sunk = (s: Ship) => cells(s).every((c) => s.hits.includes(c));
export function carrierReady(s: Ship | undefined) {
  if (!s) return false;
  return !Array.from({ length: 3 }, (_, i) =>
    s.w === 3
      ? [cell(s.x + i, s.y), cell(s.x + i, s.y + 1)]
      : [cell(s.x, s.y + i), cell(s.x + 1, s.y + i)],
  ).some((pair) => pair.every((c) => s.hits.includes(c)));
}
const shapes: [number, number, Ship['kind']][] = [
  [3, 2, 'carrier'],
  [4, 1, 'standard'],
  [3, 1, 'standard'],
  [3, 1, 'standard'],
  [2, 1, 'standard'],
  [2, 1, 'standard'],
  [2, 1, 'standard'],
  [2, 1, 'submarine'],
  [1, 1, 'standard'],
  [1, 1, 'standard'],
  [1, 1, 'standard'],
  [1, 1, 'standard'],
];
function spaced(f: Ship[]) {
  return f.every(
    (s, i) =>
      s.x >= 0 &&
      s.y >= 0 &&
      s.x + s.w <= 12 &&
      s.y + s.h <= 12 &&
      f
        .slice(0, i)
        .every((t) => s.x > t.x + t.w || t.x > s.x + s.w || s.y > t.y + t.h || t.y > s.y + s.h),
  );
}
export function shipTypes(): Ship[] {
  return shapes.map(([w,h,kind],i) => ({id: kind === 'standard' ? `ship-${i}` : kind, kind, x:0, y:0, w, h, hits:[]}));
}
export function validPlacement(f: Ship[]) {
  const templates = shipTypes();
  return new Set(f.map(s=>s.id)).size === f.length && spaced(f) && f.every(s=>templates.some(t=>t.id===s.id && t.kind===s.kind && ((t.w===s.w && t.h===s.h)||(t.w===s.h && t.h===s.w))));
}
export function deploy(g: State, p: 0 | 1, id: string, seed: number): State {
  if (g.phase !== 'setup' || g.fleets[p].some(s=>s.id===id)) throw Error('Ship unavailable');
  const template=shipTypes().find(s=>s.id===id);
  if (!template) throw Error('Unknown ship');
  const rng=random(seed), candidates: Ship[]=[];
  for(let y=0;y<12;y++) for(let x=0;x<12;x++) for(const rotated of [false,true]) {
    const ship={...template,x,y,w:rotated?template.h:template.w,h:rotated?template.w:template.h};
    if(validPlacement([...g.fleets[p],ship])) candidates.push(ship);
  }
  if(!candidates.length) throw Error('No room for ship');
  const n=clone(g); n.fleets[p].push(candidates[Math.floor(rng()*candidates.length)]!); return n;
}
export function validFleet(f: Ship[]) {
  return (
    f.length === 12 &&
    new Set(f.map((s) => s.id)).size === 12 &&
    spaced(f) &&
    shapes.every(
      ([w, h, k]) =>
        f.filter((s) => s.kind === k && ((s.w === w && s.h === h) || (s.h === w && s.w === h)))
          .length === shapes.filter(([a, b, c]) => a === w && b === h && c === k).length,
    )
  );
}
function random(seed: number) {
  let n = seed >>> 0;
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  };
}
export function fleet(seed: number): Ship[] {
  const rng = random(seed);
  for (let attempt = 0; attempt < 1000; attempt++) {
    const f: Ship[] = [];
    for (let i = 0; i < shapes.length; i++) {
      const [a, b, kind] = shapes[i]!;
      let placed = false;
      for (let j = 0; j < 300; j++) {
        const vertical = rng() < 0.5;
        const s: Ship = {
          id: kind === 'standard' ? `ship-${i}` : kind,
          kind,
          x: Math.floor(rng() * 12),
          y: Math.floor(rng() * 12),
          w: vertical ? b : a,
          h: vertical ? a : b,
          hits: [],
        };
        if (spaced([...f, s])) {
          f.push(s);
          placed = true;
          break;
        }
      }
      if (!placed) break;
    }
    if (f.length === 12) return f;
  }
  throw Error('Fleet generation failed');
}
export function create(starter: 0 | 1, seed: number, chargedAirstrikes = false): State {
  return {
    ...(chargedAirstrikes ? { airstrikeCharges: [0, 0] as [number, number] } : {}),
    kind: 'battleship',
    phase: 'setup',
    turn: starter,
    fleets: [fleet(seed), fleet(seed + 1)],
    moves: [0, 0],
    submarineHistory: [[], []],
    shots: [[], []],
    winner: null,
    lastAction: null,
  };
}
export function start(g: State): State {
  return { ...g, phase: 'battle' };
}
const clone = (g: State): State => ({
  ...g,
  fleets: g.fleets.map((f) => f.map((s) => ({ ...s, hits: [...s.hits] }))) as State['fleets'],
  moves: [...g.moves],
  ...(g.submarineHistory ? { submarineHistory: g.submarineHistory.map(trail => trail.map(s => ({ ...s, hits: [...s.hits] }))) as [SubmarinePosition[], SubmarinePosition[]] } : {}),
  ...(g.airstrikeCharges ? { airstrikeCharges: [...g.airstrikeCharges] as [number, number] } : {}),
  shots: g.shots.map((a) => a.map((m) => ({ ...m }))) as State['shots'],
});
export function configure(
  g: State,
  p: 0 | 1,
  id: string,
  x: number,
  y: number,
  vertical: boolean,
): State {
  if (g.phase !== 'setup') throw Error('Fleet locked');
  const n = clone(g);
  const s = n.fleets[p].find((s) => s.id === id);
  if (!s) throw Error('Unknown ship');
  const long = Math.max(s.w, s.h),
    short = Math.min(s.w, s.h);
  Object.assign(s, { x, y, w: vertical ? short : long, h: vertical ? long : short });
  if (!validPlacement(n.fleets[p])) throw Error('Invalid placement');
  return n;
}
export function view(g: State, p: 0 | 1): View {
  const ownShips = g.fleets[p].map((s) => ({ ...s, hits: [...s.hits] }));
  const cap = ownShips.filter((s) => !sunk(s)).length === 1 ? 3 : 2;
  return {
    kind: g.kind,
    phase: g.phase,
    turn: g.turn,
    winner: g.winner,
    ownShips,
    enemySunk: g.fleets[1 - p]!.filter(sunk).map((s) => ({ ...s, hits: [...s.hits] })),
    shots: g.shots.map((a) => a.map((m) => ({ ...m }))) as State['shots'],
    movesLeft: Math.max(0, cap - g.moves[p]),
    enemyMovesLeft: Math.max(0, (g.fleets[1 - p]!.filter(s => !sunk(s)).length === 1 ? 3 : 2) - g.moves[1 - p]!),
    ...(g.winner !== null ? { enemyReveal: {
      ships: g.fleets[1 - p]!.map(s => ({ ...s, hits: [...s.hits] })),
      ...(g.submarineHistory ? { submarineTrail: g.submarineHistory[1 - p]!.map(s => ({ ...s, hits: [...s.hits] })) } : {}),
    } } : {}),
    canSalvo: carrierReady(ownShips.find((s) => s.kind === 'carrier')!) && (!g.airstrikeCharges || g.airstrikeCharges[p] >= 5),
    ...(g.airstrikeCharges ? { airstrikeCharge: g.airstrikeCharges[p] } : {}),
    lastAction: g.lastAction
      ? { ...g.lastAction, cells: g.lastAction.cells.map((m) => ({ ...m })) }
      : null,
  };
}
export function moves(v: View) {
  const s = v.ownShips.find((s) => s.kind === 'submarine');
  if (!s || s.hits.length || !v.movesLeft) return [];
  return [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
    .map(([dx, dy]) => ({ x: s.x + dx!, y: s.y + dy! }))
    .filter((pos) => spaced(v.ownShips.map((t) => (t.id === s.id ? { ...t, ...pos } : t))));
}
function active(g: State, p: 0 | 1) {
  if (g.phase !== 'battle' || g.winner !== null || g.turn !== p) throw Error('Not your turn');
}
export function move(g: State, p: 0 | 1, x: number, y: number): State {
  active(g, p);
  if (!moves(view(g, p)).some((pos) => pos.x === x && pos.y === y)) throw Error('Invalid maneuver');
  const n = clone(g);
  const submarine = n.fleets[p].find(s => s.kind === 'submarine')!;
  n.submarineHistory?.[p].push({ ...submarine, hits: [...submarine.hits], move: n.moves[p] + 1 });
  Object.assign(submarine, { x, y });
  n.moves[p]++;
  n.turn = p === 0 ? 1 : 0;
  n.lastAction = { player: p, type: 'move', cells: [] };
  return n;
}
export function attack(
  g: State,
  p: 0 | 1,
  x: number,
  y: number,
  salvo: boolean,
  vertical: boolean,
  continueOnHit = true,
): State {
  active(g, p);
  if (!Number.isInteger(x) || !Number.isInteger(y)) throw Error('Invalid target');
  if (salvo && !view(g, p).canSalvo) throw Error('Carrier disabled');
  const w = salvo ? (g.airstrikeCharges ? 2 : vertical ? 2 : 3) : 1,
    h = salvo ? (g.airstrikeCharges ? 2 : vertical ? 3 : 2) : 1;
  if (x < 0 || y < 0 || x + w > 12 || y + h > 12) throw Error('Invalid target');
  const n = clone(g),
    marks: Mark[] = [];
  if (n.airstrikeCharges) n.airstrikeCharges[p] = salvo ? 0 : Math.min(5, n.airstrikeCharges[p] + 1);
  let freshHit = false;
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++) {
      const c = cell(x + dx, y + dy),
        s = n.fleets[1 - p]!.find((s) => cells(s).includes(c));
      if (s && !s.hits.includes(c)) { s.hits.push(c); freshHit = true; }
      const mark = { cell: c, hit: !!s };
      marks.push(mark);
      const old = n.shots[p].findIndex((m) => m.cell === c);
      if (old >= 0) n.shots[p][old] = mark;
      else n.shots[p].push(mark);
    }
  n.lastAction = { player: p, type: 'attack', cells: marks };
  n.turn = continueOnHit && !salvo && freshHit ? p : p === 0 ? 1 : 0;
  if (n.fleets[1 - p]!.every(sunk)) n.winner = p;
  return n;
}
/** Receives only knowledge available to the acting player. */
function legacyBot(v: View, seed: number) {
  const rng = random(seed);
  const p = v.turn,
    known = v.shots[p],
    sunkCells = new Set(v.enemySunk.flatMap(cells));
  const hits = known.filter((m) => m.hit && !sunkCells.has(m.cell));
  const adjacent = hits
    .flatMap((m) =>
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].map(([dx, dy]) => ({ x: (m.cell % 12) + dx!, y: Math.floor(m.cell / 12) + dy! })),
    )
    .filter(
      (c) =>
        c.x >= 0 &&
        c.x < 12 &&
        c.y >= 0 &&
        c.y < 12 &&
        !known.some((m) => m.cell === cell(c.x, c.y) && m.hit),
    );
  if (v.canSalvo) {
    const candidates: { x: number; y: number; salvo: boolean; vertical: boolean; score: number }[] =
      [];
    for (const vertical of [false, true])
      for (let y = 0; y <= 12 - (v.airstrikeCharge !== undefined ? 2 : vertical ? 3 : 2); y++)
        for (let x = 0; x <= 12 - (v.airstrikeCharge !== undefined ? 2 : vertical ? 2 : 3); x++) {
          let score = 0;
          for (let dy = 0; dy < (v.airstrikeCharge !== undefined ? 2 : vertical ? 3 : 2); dy++)
            for (let dx = 0; dx < (v.airstrikeCharge !== undefined ? 2 : vertical ? 2 : 3); dx++) {
              const c = cell(x + dx, y + dy),
                mark = known.find((m) => m.cell === c);
              score += mark?.hit
                ? 0
                : mark
                  ? 0.05
                  : adjacent.some((p) => p.x === x + dx && p.y === y + dy)
                    ? 2
                    : 1;
            }
          candidates.push({ x, y, salvo: true, vertical, score: score + rng() * 0.1 });
        }
    candidates.sort((a, b) => b.score - a.score);
    const { score: _score, ...action } = candidates[0]!;
    void _score;
    return action;
  }
  const fresh = Array.from({ length: 144 }, (_, c) => c).filter(
    (c) => !known.some((m) => m.cell === c),
  );
  const c = fresh[Math.floor(rng() * fresh.length)] ?? Math.floor(rng() * 144);
  const target = adjacent.filter((p) => !known.some((m) => m.cell === cell(p.x, p.y)))[
    Math.floor(rng() * adjacent.length)
  ] ?? { x: c % 12, y: Math.floor(c / 12) };
  return { ...target, salvo: false, vertical: false };
}

/** Scores only placements consistent with public shots and the no-touch rule. */
export function bot(v: View, seed: number, smart = true) {
  if (!smart) return legacyBot(v, seed);
  const rng = random(seed),
    known = new Map(v.shots[v.turn].map((m) => [m.cell, m.hit]));
  const blocked = new Set<number>();
  for (const ship of v.enemySunk) {
    for (
      let y = Math.max(0, ship.y - 1);
      y <= Math.min(11, ship.y + ship.h);
      y++
    )
      for (
        let x = Math.max(0, ship.x - 1);
        x <= Math.min(11, ship.x + ship.w);
        x++
      )
        blocked.add(cell(x, y));
  }
  const hits = [...known]
    .filter(([c, hit]) => hit && !blocked.has(c))
    .map(([c]) => c);
  const fresh = Array.from({ length: 144 }, (_, c) => c).filter(
    (c) => !blocked.has(c) && !known.has(c),
  );
  // Old water is reconsidered only after the search of untouched water is exhausted.
  const targets = fresh.length
    ? fresh
    : Array.from({ length: 144 }, (_, c) => c).filter(
        (c) => !blocked.has(c) && known.get(c) !== true,
      );
  const targetSet = new Set(targets),
    scores = Array<number>(144).fill(0);
  const remaining = shipTypes().filter(
    (s) => !v.enemySunk.some((t) => t.id === s.id),
  );
  for (const template of remaining) {
    const orientations =
      template.w === template.h
        ? [[template.w, template.h]]
        : [
            [template.w, template.h],
            [template.h, template.w],
          ];
    for (const [w, h] of orientations as [number, number][]) {
      for (let y = 0; y <= 12 - h; y++)
        for (let x = 0; x <= 12 - w; x++) {
          const footprint = cells({ ...template, x, y, w, h }),
            occupied = new Set(footprint);
          if (
            footprint.some(
              (c) =>
                blocked.has(c) ||
                (known.get(c) === false &&
                  (fresh.length > 0 || template.kind !== "submarine")),
            )
          )
            continue;
          // A hit immediately outside a hypothetical ship would violate spacing.
          if (
            hits.some(
              (c) =>
                !occupied.has(c) &&
                c % 12 >= x - 1 &&
                c % 12 <= x + w &&
                Math.floor(c / 12) >= y - 1 &&
                Math.floor(c / 12) <= y + h,
            )
          )
            continue;
          const count = hits.filter((c) => occupied.has(c)).length;
          const weight = count ? 100 * count * count : 1;
          for (const c of footprint) if (targetSet.has(c)) scores[c]! += weight;
        }
    }
  }
  // Strong evidence: bridge gaps first, then extend a line before trying its sides.
  for (let i = 0; i < hits.length; i++)
    for (const b of hits.slice(i + 1)) {
      const a = hits[i]!,
        ax = a % 12,
        ay = Math.floor(a / 12),
        bx = b % 12,
        by = Math.floor(b / 12);
      if (ax !== bx && ay !== by) continue;
      const distance = Math.abs(ax - bx) + Math.abs(ay - by);
      if (distance > 3) continue;
      const dx = Math.sign(bx - ax),
        dy = Math.sign(by - ay);
      const line = Array.from({ length: distance + 1 }, (_, j) =>
        cell(ax + dx * j, ay + dy * j),
      );
      if (line.some((c) => blocked.has(c) || known.get(c) === false)) continue;
      for (const c of line) if (targetSet.has(c) && scores[c]! > 0) scores[c]! += 10000;
      for (const [x, y] of [
        [ax - dx, ay - dy],
        [bx + dx, by + dy],
      ]) {
        if (x! < 0 || x! >= 12 || y! < 0 || y! >= 12) continue;
        const c = cell(x!, y!);
        if (targetSet.has(c) && scores[c]! > 0) scores[c]! += 2000;
      }
    }
  const ranked = targets
    .map((c) => ({ c, score: scores[c]! + rng() * 0.01 }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  // In a valid unfinished match there is always an eligible cell.
  if (!best) throw Error("No eligible naval target");
  if (v.canSalvo) {
    const width = v.airstrikeCharge === undefined ? 3 : 2,
      height = 2;
    const candidates: {
      x: number;
      y: number;
      vertical: boolean;
      score: number;
    }[] = [];
    for (const vertical of v.airstrikeCharge === undefined
      ? [false, true]
      : [false]) {
      const w = vertical ? height : width,
        h = vertical ? width : height;
      for (let y = 0; y <= 12 - h; y++)
        for (let x = 0; x <= 12 - w; x++) {
          const area = Array.from({ length: w * h }, (_, i) =>
            cell(x + (i % w), y + Math.floor(i / w)),
          );
          if (area.some((c) => !targetSet.has(c))) continue;
          let score = 0;
          for (let dy = 0; dy < h; dy++)
            for (let dx = 0; dx < w; dx++) {
              const c = cell(x + dx, y + dy);
              if (targetSet.has(c)) score += scores[c]!;
            }
          candidates.push({ x, y, vertical, score: score + rng() * 0.01 });
        }
    }
    candidates.sort((a, b) => b.score - a.score);
    const salvo = candidates[0]!;
    // Keep the turn when a single precise finishing shot is more useful.
    if (salvo && salvo.score > best.score * 1.6)
      return { x: salvo.x, y: salvo.y, vertical: salvo.vertical, salvo: true };
  }
  return {
    x: best.c % 12,
    y: Math.floor(best.c / 12),
    vertical: false,
    salvo: false,
  };
}
