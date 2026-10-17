import { expect, it } from 'vitest';
import * as sea from '../../src/barGames/battleship.js';
it('creates twelve non-touching ships occupying 28 cells deterministically', () => {
  for (let seed = 0; seed < 40; seed++) {
    const g = sea.create(0, seed);
    expect(g).toEqual(sea.create(0, seed));
    for (const fleet of g.fleets) {
      expect(fleet).toHaveLength(12);
      expect(fleet.reduce((n, s) => n + s.w * s.h, 0)).toBe(28);
      expect(sea.validFleet(fleet)).toBe(true);
    }
  }
});
it('disables a carrier only after a complete transverse pair, in either orientation', () => {
  for (const vertical of [false, true]) {
    const s: sea.Ship = {
      id: 'carrier',
      kind: 'carrier',
      x: 1,
      y: 1,
      w: vertical ? 2 : 3,
      h: vertical ? 3 : 2,
      hits: [],
    };
    const cells = sea.cells(s);
    s.hits = cells.filter((c) => (vertical ? c % 12 === 1 : Math.floor(c / 12) === 1));
    expect(sea.carrierReady(s)).toBe(true);
    s.hits = [sea.cell(1, 1), sea.cell(vertical ? 2 : 1, vertical ? 1 : 2)];
    expect(sea.carrierReady(s)).toBe(false);
  }
});
it('keeps enemy positions and private fleets out of the public view and bot input', () => {
  const g = sea.start(sea.create(0, 3));
  const v = sea.view(g, 0);
  expect('fleets' in v).toBe(false);
  expect(v.ownShips).toEqual(g.fleets[0]);
  expect(v.enemySunk).toEqual([]);
  expect(JSON.stringify(v)).not.toContain('"seed"');
  const changed = { ...g, fleets: [g.fleets[0], sea.fleet(44)] as [sea.Ship[], sea.Ship[]] };
  expect(sea.bot(sea.view(g, 0), 4)).toEqual(sea.bot(sea.view(changed, 0), 4));
});
it('legacy rules pass after hits and salvos and permits shooting old water again', () => {
  let g = sea.start(sea.create(0, 1));
  const c = sea.cells(g.fleets[1][0]!)[0]!;
  g = sea.attack(g, 0, c % 12, Math.floor(c / 12), false, false, false);
  expect(g.turn).toBe(1);
  expect(g.shots[0].find((x) => x.cell === c)?.hit).toBe(true);
  g = sea.attack(g, 1, 10, 9, true, true);
  expect(g.lastAction?.cells).toHaveLength(6);
  expect(g.turn).toBe(0);
  expect(() => sea.attack(g, 0, c % 12, Math.floor(c / 12), false, false)).not.toThrow();
});
it('moves only an undamaged submarine by one orthogonal cell with a total limit of 2 or 3', () => {
  let g = sea.start(sea.create(0, 4));
  const v = sea.view(g, 0);
  const legal = sea.moves(v);
  expect(legal.length).toBeGreaterThan(0);
  g = sea.move(g, 0, legal[0]!.x, legal[0]!.y);
  expect(g.turn).toBe(1);
  expect(g.moves[0]).toBe(1);
  expect(g.lastAction?.cells).toEqual([]);
  const sub = g.fleets[0].find((s) => s.kind === 'submarine')!;
  sub.hits = [sea.cells(sub)[0]!];
  expect(sea.moves(sea.view(g, 0))).toEqual([]);
});
it('rejects invalid layouts and attacks and requires all carrier cells to sink', () => {
  const g = sea.create(0, 1);
  expect(() => sea.configure(g, 0, 'carrier', -1, 0, false)).toThrow();
  const active = sea.start(g);
  expect(() => sea.attack(active, 0, 11, 11, true, false)).toThrow();
  expect(() => sea.configure(active, 0, 'carrier', 0, 0, false)).toThrow();
});
it('allows a submarine to enter old water, which can be hit on a repeat attack', () => {
  let g = sea.start(sea.create(1, 4));
  const sub = g.fleets[0].find((s) => s.kind === 'submarine')!,
    dest = sea.moves(sea.view(g, 0))[0]!;
  const target = sea.cells({ ...sub, ...dest }).find((c) => !sea.cells(sub).includes(c))!;
  g = sea.attack(g, 1, target % 12, Math.floor(target / 12), false, false);
  expect(g.shots[1].find((m) => m.cell === target)?.hit).toBe(false);
  g = sea.move(g, 0, dest.x, dest.y);
  expect(sea.view(g, 1).lastAction).toEqual({ player: 0, type: 'move', cells: [] });
  g = sea.attack(g, 1, target % 12, Math.floor(target / 12), false, false);
  expect(g.shots[1].find((m) => m.cell === target)?.hit).toBe(true);
  expect(sea.moves(sea.view(g, 0))).toEqual([]);
});
it('adds only one total maneuver for the last surviving submarine and retains wreck spacing', () => {
  const g = sea.start(sea.create(0, 4));
  g.moves[0] = 2;
  expect(sea.moves(sea.view(g, 0))).toEqual([]);
  for (const s of g.fleets[0]) if (s.kind !== 'submarine') s.hits = sea.cells(s);
  expect(sea.view(g, 0).movesLeft).toBe(1);
  expect(sea.moves(sea.view(g, 0)).length).toBeGreaterThan(0);
  g.moves[0] = 3;
  expect(sea.view(g, 0).movesLeft).toBe(0);
});
it('wins only after destroying all occupied cells and does not count repeated hits twice', () => {
  let g = sea.start(sea.create(0, 1));
  for (const s of g.fleets[1]) s.hits = sea.cells(s);
  const last = g.fleets[1].find((s) => s.kind === 'carrier')!;
  const c = last.hits.pop()!;
  const hit = last.hits[0]!;
  g = sea.attack(g, 0, hit % 12, Math.floor(hit / 12), false, false);
  expect(g.winner).toBeNull();
  expect(g.fleets[1].find((s) => s.kind === 'carrier')!.hits).toHaveLength(5);
  g.turn = 0;
  g = sea.attack(g, 0, c % 12, Math.floor(c / 12), false, false, false);
  expect(g.winner).toBe(0);
});
it('places reserves one by one without duplicates and accepts partial fleet movement', () => {
  let g=sea.create(0,4); g.fleets[0]=[];
  expect(sea.validPlacement([])).toBe(true);
  for(const template of sea.shipTypes()) {
    g=sea.deploy(g,0,template.id,17);
    const ship=g.fleets[0].find(s=>s.id===template.id)!;
    g=sea.configure(g,0,ship.id,ship.x,ship.y,ship.h>ship.w);
    expect(sea.validPlacement(g.fleets[0])).toBe(true);
    expect(()=>sea.deploy(g,0,template.id,17)).toThrow();
  }
  expect(sea.validFleet(g.fleets[0])).toBe(true);
});
it('retains the turn only for a new ordinary hit; salvos, misses and repeat hits pass',()=>{
 const g=sea.start(sea.create(0,1)),c=sea.cells(g.fleets[1][0]!)[0]!;
 const hit=sea.attack(g,0,c%12,Math.floor(c/12),false,false);
 expect(hit.turn).toBe(0);
 expect(sea.attack(hit,0,c%12,Math.floor(c/12),false,false).turn).toBe(1);
 expect(sea.attack(g,0,c%12,Math.floor(c/12),true,false).turn).toBe(1);
 expect(sea.attack(g,0,c%12,Math.floor(c/12),false,false,false).turn).toBe(1);
});
it('charges a four-cell airstrike only through five ordinary shots and resets after use', () => {
  let g = sea.start(sea.create(0, 4, true));
  expect(sea.view(g, 0).canSalvo).toBe(false);
  expect(() => sea.attack(g, 0, 0, 0, true, false)).toThrow();
  for (let i=0;i<5;i++) {
    g.turn=0;
    g=sea.attack(g,0,11,11,false,false);
    expect(sea.view(g,0).airstrikeCharge).toBe(i+1);
  }
  g.turn=0;
  g=sea.attack(g,0,10,10,true,false);
  expect(g.lastAction!.cells).toHaveLength(4);
  expect(g.turn).toBe(1);
  expect(sea.view(g,0).airstrikeCharge).toBe(0);
  expect(sea.view(g,0).canSalvo).toBe(false);
});
it('does not expose the enemy charge, mutates neither input, and keeps legacy salvos', () => {
  const old = sea.start(sea.create(0, 5));
  expect(sea.attack(old,0,0,0,true,false).lastAction!.cells).toHaveLength(6);
  const current=sea.start(sea.create(0,5,true));
  current.airstrikeCharges=[5,3];
  const before=JSON.stringify(current);
  const after=sea.attack(current,0,0,0,true,true);
  expect(after.lastAction!.cells).toHaveLength(4);
  expect(JSON.stringify(current)).toBe(before);
  expect(sea.view(current,0).airstrikeCharge).toBe(5);
  expect('airstrikeCharges' in sea.view(current,0)).toBe(false);
  const carrier=current.fleets[0].find(s=>s.kind==='carrier')!;
  carrier.hits=carrier.w===3?[sea.cell(carrier.x,carrier.y),sea.cell(carrier.x,carrier.y+1)]:[sea.cell(carrier.x,carrier.y),sea.cell(carrier.x+1,carrier.y)];
  expect(sea.view(current,0).canSalvo).toBe(false);
});
