import { expect, it } from 'vitest';
import { createDrift, stepDrift, driftProgress, DRIFT_TARGET } from '../src/caretaker/drift.js';
it('is deterministic and does not clean while stationary', () => {
  const a = createDrift('ice');
  let b = createDrift('ice');
  for (let i = 0; i < 120; i++) b = stepDrift(b, { x: 0, y: 0, held: false });
  expect(b.snow).toEqual(a.snow);
  expect(driftProgress(b)).toBe(0);
  expect(createDrift('ice')).toEqual(a);
});
it('accelerates, retains sideways velocity during a turn and keeps a long coast after release', () => {
  let s = createDrift('ice');
  for (let i = 0; i < 45; i++) s = stepDrift(s, { x: 1, y: 0, held: true });
  const vx = s.vx;
  expect(vx).toBeGreaterThan(30);
  s = stepDrift(s, { x: 0, y: -1, held: true });
  expect(s.vx).toBeGreaterThan(vx * 0.8);
  s = {...s,x:300,y:400,vx:100,vy:-10,angle:0};
  const speed = Math.hypot(s.vx, s.vy);
  for (let i = 0; i < 120; i++) s = stepDrift(s, { x: 0, y: 0, held: false });
  expect(Math.hypot(s.vx, s.vy)).toBeGreaterThan(speed * 0.2);
});
it('keeps the caretaker inside the boards', () => {
  let s = createDrift('ice');
  for (let i = 0; i < 1000; i++) s = stepDrift(s, { x: 1, y: 0, held: true });
  expect(s.x).toBeLessThanOrEqual(548);
  expect(s.x).toBeGreaterThanOrEqual(52);
});
it('cleans only snow crossed by the scraper edge', () => {
  let s = createDrift('ice');
  s = { ...s, x: 300, y: 400, angle: 0, vx: 120, vy: 0, snow: Array(3072).fill(0), initialSnow: 2 };
  s.snow[32 * 48 + 28] = 1;
  s.snow[32 * 48 + 17] = 1;
  for (let i = 0; i < 15; i++) s = stepDrift(s, { x: 1, y: 0, held: true });
  expect(s.snow[32 * 48 + 28]).toBe(0);
  expect(s.snow[32 * 48 + 17]).toBe(1);
});
it('reaches the side board with the front blade without the old empty margin',()=>{
 let s={...createDrift('edge'),x:540,y:400,angle:0,vx:200,vy:0};
 let furthest = 0;
 for(let i=0;i<90;i++){s=stepDrift(s,{x:1,y:0,held:true});furthest=Math.max(furthest,s.x+54);}
 expect(furthest).toBeGreaterThan(592);
 expect(s.x+54).toBeLessThanOrEqual(600);
});

it('requires every snow cell to be cleared, including the final cell', () => {
  const state = { ...createDrift('completion'), initialSnow: 100, cleared: 85 };
  expect(driftProgress(state)).toBeLessThan(DRIFT_TARGET);
  expect(driftProgress({ ...state, cleared: 99 })).toBeLessThan(DRIFT_TARGET);
  expect(driftProgress({ ...state, cleared: 100 })).toBe(DRIFT_TARGET);
});

it('rebounds elastically and does not reverse an already inward velocity', () => {
  const s = { ...createDrift('bounce'), x: 545, y: 400, angle: 0, vx: 180, vy: 0 };
  const hit = stepDrift(s, { x: 0, y: 0, held: false });
  expect(hit.vx).toBeLessThan(-100);
  const inward = stepDrift({ ...s, x: 548, vx: -80 }, { x: 0, y: 0, held: false });
  expect(inward.vx).toBeLessThan(0);
});
it('falls on a hard normal impact and ignores controls for exactly one second', () => {
  let s = stepDrift({ ...createDrift('fall'), x: 545, y: 400, angle: 0, vx: 330, vy: 0 }, { x: 1, y: 0, held: true });
  expect(s.fallTicks).toBe(60);
  const { x, y, cleared } = s;
  for (let i = 0; i < 60; i++) s = stepDrift(s, { x: -1, y: 0, held: true });
  expect(s.fallTicks).toBe(0);
  expect([s.x, s.y, s.cleared]).toEqual([x, y, cleared]);
  s = stepDrift(s, { x: -1, y: 0, held: true });
  expect(Math.hypot(s.vx, s.vy)).toBeGreaterThan(0);
});
it('does not fall from a fast glancing collision', () => {
  const s = stepDrift({ ...createDrift('glance'), x: 546, y: 400, angle: 0, vx: 20, vy: 300 }, { x: 0, y: 0, held: false });
  expect(s.fallTicks).toBe(0);
});

it('turns and accelerates more sharply while retaining lateral momentum', () => {
 const initial = { ...createDrift('sharp'), x: 300, y: 400, angle: 0, vx: 100, vy: 0 };
 const next = stepDrift(initial, {x:0,y:-1,held:true});
 expect(next.angle).toBeLessThan(-0.07);
 expect(next.vx).toBeGreaterThan(109);
});
it('scatters a bounded portion of fresh snow without creating extra work indefinitely', () => {
 let state = {...createDrift('scatter'), x:300,y:400,angle:0,vx:200,vy:0};
 const before = structuredClone(state);
 for(let i=0;i<60;i++) state=stepDrift(state,{x:1,y:0,held:true});
 expect(state.snow.some(v=>v===2)).toBe(true);
 expect(state.cleared + state.snow.filter(Boolean).length).toBe(state.initialSnow);
 let replay=before;
 for(let i=0;i<60;i++)replay=stepDrift(replay,{x:1,y:0,held:true});
 expect(replay).toEqual(state);
 let fragment={...createDrift('fragment'),x:300,y:400,angle:0,vx:120,vy:0,snow:Array(3072).fill(0),initialSnow:1};
 fragment.snow[32*48+28]=2;
 for(let i=0;i<15;i++)fragment=stepDrift(fragment,{x:1,y:0,held:true});
 expect(fragment.snow.filter(Boolean)).toHaveLength(0);
 expect(driftProgress(fragment)).toBe(1);
});

it('falls on the second separate gentle push and resets the count after falling', () => {
 const hit = (state: ReturnType<typeof createDrift>) => stepDrift({...state,x:545,y:400,angle:0,vx:130,vy:0,reboundTicks:0,collision:0},{x:1,y:0,held:true});
 let state=hit(createDrift('two-pushes'));
 expect(state.fallTicks).toBe(0);
 expect(state.gentleHits).toBe(1);
 state=hit(state);
 expect(state.fallTicks).toBe(60);
 expect(state.gentleHits).toBe(0);
});
it('does not count a continuous board contact twice during the rebound', () => {
 const state=stepDrift({...createDrift('contact'),x:545,y:400,angle:0,vx:130,vy:0},{x:1,y:0,held:true});
 const next=stepDrift({...state,x:548,vx:130},{x:1,y:0,held:true});
 expect(next.fallTicks).toBe(0);
 expect(next.gentleHits).toBe(1);
});
