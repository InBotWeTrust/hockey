import { describe, expect, it } from 'vitest';
import * as core from './index.js';
const api = core;
const rules={version:1 as const,seed:'yard-test',durationMs:150000};
describe('cyberpunk environment',()=>{
 it('provides a seeded schedule of twenty strips and ten outages, with readable gaps',()=>{
  expect(typeof api.createCyberpunkSchedule).toBe('function');
  const events=api.createCyberpunkSchedule(rules);
  expect(events).toEqual(api.createCyberpunkSchedule(rules));
  expect(events.filter(e=>e.kind==='strip')).toHaveLength(20);
  expect(events.filter(e=>e.kind==='outage')).toHaveLength(10);
  const strips=events.filter(e=>e.kind==='strip');
  expect(new Set(strips.map(e=>e.strip)).size).toBe(6);
  for(let i=1;i<strips.length;i++) expect(strips[i]!.startMs-strips[i-1]!.endMs).toBeGreaterThanOrEqual(3000);
  expect(events.every(e=>e.endMs<=150000)).toBe(true);
 });
 it('requires three taps to switch off the current strip, then next event works',()=>{
  expect(typeof api.sampleCyberpunkEnvironment).toBe('function');
  const strips=api.createCyberpunkSchedule(rules).filter(e=>e.kind==='strip'); const first=strips[0]!;
  const t=first.startMs+1200;
  const taps=[0,1,2].map(n=>({id:String(n),eventId:first.id,tapTime:t+n*200}));
  expect(api.sampleCyberpunkEnvironment(rules,t+500,taps.slice(0,2)).remainingTaps).toBe(1);
  expect(api.sampleCyberpunkEnvironment(rules,t+500,taps).activeStrip).toBeNull();
  expect(api.sampleCyberpunkEnvironment(rules,strips[1]!.startMs+1100,taps).activeStrip).not.toBeNull();
 });
 it('integrates a strip switching off during puck flight instead of freezing tap-time speed',()=>{
  expect(typeof api.traceCyberpunkFlight).toBe('function');
  const flight=api.traceCyberpunkFlight({x:286,startY:400,endY:200,speedPerMs:1,tapTime:0,
   events:[{id:'a',kind:'strip' as const,strip:1,startMs:-1000,endMs:100}],panelEvents:[]});
  expect(flight.durationMs).toBeGreaterThan(200);
  expect(flight.durationMs).toBeLessThan(400);
  expect(flight.arrivalMsAtY(200)).toBe(flight.durationMs);
  expect(flight.segments.some((s)=>s.speedPerMs===.1)).toBe(true);
  expect(flight.segments.some((s)=>s.speedPerMs===1)).toBe(true);
 });
});
it('moves stumble past a chain of shot pauses and restores 30% speed without jumping',async()=>{
 const api=await import('./index.js');
 expect(typeof api.cyberpunkEnvironmentForHistory).toBe('function');
 const env={cyberpunk:rules,fatigue:{slowdownStartMs:12000,heavyStartMs:24000,stopStartMs:36000,stopDurationMs:4000,recoveryDurationMs:6000,slowMultiplier:.85,heavyMultiplier:.65}};
 const pauses=[{tapTime:9990,flightMs:1000},{tapTime:11000,flightMs:1000}];
 const sampled=api.cyberpunkEnvironmentForHistory(env,pauses);
 expect(sampled.stumbleWindows![0]!.startMs).toBeGreaterThanOrEqual(12000);
 const plain=api.cyberpunkEnvironmentForHistory(env,[]);
 const before=api.cyberpunkShooterMotion(plain,10000,1,[]);
 const after=api.cyberpunkShooterMotion(plain,10800,1,[]);
 expect(after-before).toBeCloseTo(240);
});

it("adds a perceptible delay while crossing a fully active plate",()=>{
 const flight=api.traceCyberpunkFlight({x:286,startY:400,endY:200,speedPerMs:1.3,tapTime:0,events:[{id:"a",kind:"strip",strip:1,startMs:-1000,endMs:4000}],panelEvents:[]});
 expect(flight.durationMs-200/1.3).toBeCloseTo(28/1.3*9);
});

it('allows independent overlapping outages lasting five seconds of darkness',()=>{
 const events=api.createCyberpunkSchedule(rules);
 const strips=events.filter(e=>e.kind==='strip');
 const outages=events.filter(e=>e.kind==='outage');
 expect(outages.every(e=>e.endMs-e.startMs===6000)).toBe(true);
 expect(strips.some(s=>outages.some(o=>s.startMs+1000<o.endMs && o.startMs+1000<s.endMs))).toBe(true);
 expect(strips.some((s,i)=>s.strip!==i%6)).toBe(true);
 expect(outages.some(o=>!strips.some(s=>s.endMs===o.startMs))).toBe(true);
});

it('uses half-rink plates with edges converging toward the rink center',()=>{
 expect(api.CYBERPUNK_STRIPS.every(s=>s.width===286)).toBe(true);
});

it('starts the next scoring window after the actual previous magnetic flight',()=>{
 expect(api.cyberpunkEarliestTap([{tapTime:1000,flightMs:800}])).toBe(1800);
 expect(api.cyberpunkEarliestTap([])).toBe(0);
});
