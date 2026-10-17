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
it('finishes the gap between collinear hits instead of hunting elsewhere',()=>{
 const v=sea.view(sea.start(sea.create(0,4,true)),0);v.canSalvo=false;
 v.shots[0]=[{cell:sea.cell(2,4),hit:true},{cell:sea.cell(4,4),hit:true}];
 for(let seed=0;seed<20;seed++)expect(sea.bot(v,seed)).toMatchObject({x:3,y:4,salvo:false});
});
it('extends a discovered line and avoids already fired cells',()=>{
 const v=sea.view(sea.start(sea.create(0,4,true)),0);v.canSalvo=false;
 v.shots[0]=[{cell:sea.cell(4,4),hit:true},{cell:sea.cell(5,4),hit:true},{cell:sea.cell(3,4),hit:false}];
 for(let seed=0;seed<20;seed++)expect(sea.bot(v,seed)).toMatchObject({x:6,y:4,salvo:false});
});
it('never targets sunk ships or their surrounding water, including when fresh water is exhausted',()=>{
 const v=sea.view(sea.start(sea.create(0,4,true)),0);v.canSalvo=false;
 const destroyed:sea.Ship={id:'ship-4',kind:'standard',x:4,y:4,w:2,h:1,hits:[sea.cell(4,4),sea.cell(5,4)]};
 v.enemySunk=[destroyed];
 const blocked=(x:number,y:number)=>x>=3&&x<=6&&y>=3&&y<=5;
 for(const exhausted of [false,true]){
 v.shots[0]=exhausted?Array.from({length:144},(_,c)=>({cell:c,hit:destroyed.hits.includes(c)})):destroyed.hits.map(cell=>({cell,hit:true}));
 for(let seed=0;seed<40;seed++){const b=sea.bot(v,seed);expect(blocked(b.x,b.y)).toBe(false);}
 }
});
it('keeps finishing damaged carriers without repeating hits even after a full long side is hit',()=>{
 const v=sea.view(sea.start(sea.create(0,4,true)),0);v.canSalvo=false;
 // A full long side must lead to the parallel side, never old hit cells.
 v.shots[0]=[4,5,6].map(y=>({cell:sea.cell(4,y),hit:true}));
 v.shots[0].push({cell:sea.cell(4,3),hit:false},{cell:sea.cell(4,7),hit:false});
 for(let seed=0;seed<20;seed++){
  const b=sea.bot(v,seed);
  expect([3,5]).toContain(b.x);expect(b.y).toBeGreaterThanOrEqual(4);expect(b.y).toBeLessThanOrEqual(6);
 }
});
it('searches deterministically without exposing hidden fleets and wastes no airstrike cells on known water',()=>{
 const v=sea.view(sea.start(sea.create(0,4,true)),0);v.airstrikeCharge=5;v.canSalvo=true;
 v.shots[0]=[{cell:sea.cell(5,5),hit:false},{cell:sea.cell(6,5),hit:true}];
 for(let seed=0;seed<20;seed++){
  const before=JSON.stringify(v),b=sea.bot(v,seed);expect(sea.bot(v,seed)).toEqual(b);expect(JSON.stringify(v)).toBe(before);
  if(b.salvo)for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)expect(v.shots[0].some(m=>m.cell===sea.cell(b.x+dx,b.y+dy))).toBe(false);
 }
});
it('completes a fixed fleet search more efficiently than the legacy hunter without repeated shots',()=>{
 const totals=[0,0];
 for(const smart of [false,true])for(let seed=1;seed<=10;seed++){
  let g=sea.start(sea.create(0,seed,true)),count=0;
  const visited=new Set<number>();
  while(g.winner===null&&count<200){
   g.turn=0;const v=sea.view(g,0);v.canSalvo=false;
   const b=sea.bot(v,seed*1000+count,smart),c=sea.cell(b.x,b.y);
   if(smart)expect(visited.has(c)).toBe(false);
   visited.add(c);g=sea.attack(g,0,b.x,b.y,false,false);count++;
  }
  expect(g.winner).toBe(0);totals[smart?1:0]!+=count;
 }
 expect(totals[1]!).toBeLessThan(totals[0]!*.9);
});
it('does not extend a line beyond the size of the only remaining carrier',()=>{
 const g=sea.start(sea.create(0,4,true));
 const carrier=g.fleets[1].find(s=>s.kind==='carrier')!;
 for(const s of g.fleets[1])if(s!==carrier)s.hits=sea.cells(s);
 const hits=sea.cells(carrier).filter(c=>carrier.w===3?Math.floor(c/12)===carrier.y:c%12===carrier.x);
 const v=sea.view(g,0);v.canSalvo=false;v.shots[0]=hits.map(cell=>({cell,hit:true}));
 const remaining=sea.cells(carrier).filter(c=>!hits.includes(c));
 for(let seed=0;seed<20;seed++){const b=sea.bot(v,seed);expect(remaining).toContain(sea.cell(b.x,b.y));}
});

it('reveals the enemy fleet and numbered submarine trail only after the match ends', () => {
  const g = sea.start(sea.create(1, 4));
  const destination = sea.moves(sea.view(g, 1))[0]!;
  const original = structuredClone(g.fleets[1].find(s => s.kind === 'submarine')!);
  const moved = sea.move(g, 1, destination.x, destination.y);
  const hidden = sea.view(moved, 0);
  expect(hidden).not.toHaveProperty('submarineHistory');
  expect(hidden).not.toHaveProperty('enemyReveal');
  expect(hidden.enemyMovesLeft).toBe(1);
  moved.winner = 0;
  const final = sea.view(moved, 0);
  expect(final.enemyReveal?.ships).toEqual(moved.fleets[1]);
  expect(final.enemyReveal?.submarineTrail).toEqual([{ ...original, move: 1 }]);
  final.enemyReveal!.ships[0]!.hits.push(999);
  expect(moved.fleets[1][0]!.hits).not.toContain(999);
});
it('keeps missing legacy submarine history explicit and grants the last-ship third maneuver', () => {
  const g = sea.start(sea.create(0, 4));
  delete g.submarineHistory;
  for (const s of g.fleets[1]) if (s.kind !== 'submarine') s.hits = sea.cells(s);
  g.moves[1] = 2;
  expect(sea.view(g, 0).enemyMovesLeft).toBe(1);
  g.winner = 'draw';
  expect(sea.view(g, 0).enemyReveal?.submarineTrail).toBeUndefined();
});

it('fills sunk borders with real blocked water and forbids modern submarines on shot cells', () => {
 const g=sea.start(sea.create(0,4,true,true));
 const victim=g.fleets[1].find(s=>s.w*s.h===1)!;
 const hit=sea.attack(g,0,victim.x,victim.y,false,false);
 for(const border of sea.surroundingWater([victim]))expect(hit.shots[0]).toContainEqual({cell:border,hit:false});
 const sub=g.fleets[0].find(s=>s.kind==='submarine')!;
 const destination=sea.moves(sea.view(g,0))[0]!;
 g.shots[1].push({cell:sea.cell(destination.x,destination.y),hit:false});
 expect(sea.moves(sea.view(g,0))).not.toContainEqual(destination);
 expect(()=>sea.move(g,0,destination.x,destination.y)).toThrow();
 expect(sub.hits).toEqual([]);
});
it('lets a damaged submarine detach one cell, keeps a wreck and sinks only on a fresh survivor hit',()=>{
 const g=sea.start(sea.create(0,4,true,true));
 const sub=g.fleets[0].find(s=>s.kind==='submarine')!;const wreck=sea.cells(sub)[0]!;sub.hits=[wreck];g.shots[1]=[{cell:wreck,hit:true}];
 const choices=sea.moves(sea.view(g,0));expect(choices.length).toBeGreaterThan(4);
 const destination=choices.find(p=>Math.abs(p.x-sub.x)+Math.abs(p.y-sub.y)>3)!;
 g.shots[1].push({cell:sea.cell(destination.x,destination.y),hit:false});
 expect(sea.moves(sea.view(g,0))).not.toContainEqual(destination);
 g.shots[1].pop();
 const moved=sea.move(g,0,destination.x,destination.y);
 const survivor=moved.fleets[0].find(s=>s.kind==='submarine')!;
 expect(survivor).toMatchObject({...destination,w:1,h:1,hits:[],wreck});
 expect(moved.moves[0]).toBe(1);expect(moved.turn).toBe(1);
 const laterMoves=sea.moves(sea.view(moved,0));
 expect(laterMoves.length).toBeGreaterThan(0);
 expect(laterMoves.every(p=>Math.abs(p.x-survivor.x)+Math.abs(p.y-survivor.y)===1)).toBe(true);
 expect(sea.view(moved,1).enemyWrecks).toEqual([wreck]);
 expect(sea.view(moved,1)).not.toHaveProperty('enemyReveal');
 const botShot=sea.bot(sea.view(moved,1),3);
 expect(sea.cell(botShot.x,botShot.y)).not.toBe(wreck);
 const repeat=sea.attack(moved,1,wreck%12,Math.floor(wreck/12),false,false);
 expect(repeat.turn).toBe(0);expect(repeat.fleets[0].find(s=>s.kind==='submarine')!.hits).toEqual([]);
 repeat.turn=1;
 const dead=sea.attack(repeat,1,survivor.x,survivor.y,false,false);
 expect(sea.view(dead,1).enemySunk.some(s=>s.id==='submarine')).toBe(true);
 expect(g.fleets[0].find(s=>s.kind==='submarine')!.w*g.fleets[0].find(s=>s.kind==='submarine')!.h).toBe(2);
});
it('never hunts beside an abandoned submarine wreck when only the survivor remains',()=>{
 const g=sea.start(sea.create(1,4,true,true));const sub=g.fleets[1].find(s=>s.kind==='submarine')!;
 sub.hits=[sea.cells(sub)[0]!];const wreck=sub.hits[0]!;
 const destination=sea.moves(sea.view(g,1)).find(p=>Math.abs(p.x-sub.x)+Math.abs(p.y-sub.y)>3)!;
 const moved=sea.move(g,1,destination.x,destination.y);
 for(const ship of moved.fleets[1])if(ship.kind!=='submarine')ship.hits=sea.cells(ship);
 const survivor=sea.cell(destination.x,destination.y);
 const wreckShip={...sub,x:wreck%12,y:Math.floor(wreck/12),w:1,h:1};
 const unknown=new Set([...sea.surroundingWater([wreckShip]),survivor]);
 moved.shots[0]=Array.from({length:144},(_,cell)=>cell).filter(c=>!unknown.has(c)).map(cell=>({cell,hit:cell===wreck||moved.fleets[1].some(s=>s.hits.includes(cell))}));
 moved.turn=0;
 for(let seed=0;seed<32;seed++){
  const target=sea.bot(sea.view(moved,0),seed);
  expect(sea.cell(target.x,target.y)).toBe(survivor);
 }
});
it('unlocks one rescue only after a hit followed by a miss and never grants another maneuver',()=>{
 const g=sea.start(sea.create(1,4,true,true,true));
 expect(sea.moves(sea.view(g,0))).toEqual([]);
 const sub=g.fleets[0].find(s=>s.kind==='submarine')!;
 const hit=sea.attack(g,1,sub.x,sub.y,false,false);
 expect(sea.moves(sea.view(hit,0))).toEqual([]);
 const missCell=Array.from({length:144},(_,c)=>c).find(c=>!hit.fleets[0].some(s=>sea.cells(s).includes(c)))!;
 const missed=sea.attack(hit,1,missCell%12,Math.floor(missCell/12),false,false);
 const target=sea.moves(sea.view(missed,0))[0]!;expect(target).toBeDefined();
 const escaped=sea.move(missed,0,target.x,target.y);
 expect(sea.moves(sea.view(escaped,0))).toEqual([]);
 expect(sea.view(escaped,0).maneuverAvailable).toBe(false);
 const again=sea.attack(escaped,1,missCell%12,Math.floor(missCell/12),false,false);
 expect(sea.view(again,0).maneuverAvailable).toBe(false);
 for(const ship of escaped.fleets[0])if(ship.kind!=='submarine')ship.hits=sea.cells(ship);
 expect(sea.view(escaped,0).movesLeft).toBe(0);
 expect(sea.view(escaped,1).enemyMovesLeft).toBe(0);
 escaped.turn=0;expect(()=>sea.move(escaped,0,sub.x,sub.y)).toThrow();
});
