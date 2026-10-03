import { createRng } from './rng.js';
import type { BeachPuckFlight, BeachFlightSegment } from './beachEnvironment.js';
export interface CyberpunkRules { version: 1; seed: string; durationMs: number }
export interface CyberpunkPanelEvent { id: string; eventId: string; tapTime: number }
export interface CyberpunkEvent { id: string; kind: 'strip' | 'outage'; strip: number; startMs: number; endMs: number }
export const CYBERPUNK_STRIPS = [
  { x: 155, y: 330, width: 286, height: 28 },
  { x: 286, y: 310, width: 286, height: 28 },
  { x: 417, y: 290, width: 286, height: 28 },
  { x: 180, y: 410, width: 286, height: 28 },
  { x: 380, y: 380, width: 286, height: 28 },
  { x: 286, y: 240, width: 286, height: 28 },
] as const;
/** Edges converge toward the center of the far end of the rink. */
export function cyberpunkStripBounds(strip:{x:number;y:number;width:number},y:number) {
 const scale=(y+300)/(strip.y+300);
 return {left:286+(strip.x-strip.width/2-286)*scale,right:286+(strip.x+strip.width/2-286)*scale};
}
export function createCyberpunkSchedule(rules: CyberpunkRules): CyberpunkEvent[] {
  const rng = createRng(`${rules.seed}:cyberpunk:strips`);
  const lights = createRng(`${rules.seed}:cyberpunk:lights`);
  const events: CyberpunkEvent[] = [];
  for (let slot = 0; slot < Math.floor(rules.durationMs / 7500); slot++) {
    const startMs = slot * 7500 + 500 + Math.floor(rng.next() * 500);
    const endMs = startMs + 4000;
    if (endMs > rules.durationMs) break;
    events.push({ id: `strip-${slot}`, kind: 'strip', strip: Math.floor(rng.next()*CYBERPUNK_STRIPS.length), startMs, endMs });
  }
  for (let slot = 0; slot < Math.floor(rules.durationMs / 15000); slot++) {
    const startMs = slot * 15000 + 500 + Math.floor(lights.next()*7000);
    events.push({id:`outage-${slot}`,kind:'outage',strip:-1,startMs,endMs:startMs+6000});
  }
  events.sort((a,b)=>a.startMs-b.startMs);
  return events;
}
function shutdown(event: CyberpunkEvent, taps: readonly CyberpunkPanelEvent[]): number {
  return taps.filter(t => t.eventId === event.id && t.tapTime >= event.startMs + 1000 && t.tapTime < event.endMs)
    .sort((a,b) => a.tapTime-b.tapTime)[2]?.tapTime ?? Infinity;
}
export function sampleCyberpunkEnvironment(rules: CyberpunkRules, time: number, taps: readonly CyberpunkPanelEvent[]) {
  const events = createCyberpunkSchedule(rules);
  const strip = events.find(e => e.kind === 'strip' && time >= e.startMs && time < e.endMs) ?? null;
  const activeStrip = strip && time >= strip.startMs + 1000 && time < shutdown(strip,taps) ? strip : null;
  const count = strip ? taps.filter(t=>t.eventId===strip.id && t.tapTime<=time).length : 0;
  const outage = events.find(e=>e.kind==='outage' && time>=e.startMs && time<e.endMs) ?? null;
  return { activeStrip, warningStrip: strip && time < strip.startMs + 1000 ? strip : null,
    remainingTaps: Math.max(0,3-count), outage: Boolean(outage && time>=outage.startMs+1000),
    outageWarning: Boolean(outage && time<outage.startMs+1000) };
}
/** Exact piecewise integration over spatial and temporal boundaries. */
export function traceCyberpunkFlight(input: {
  x: number; startY: number; endY: number; speedPerMs: number; tapTime: number;
  events: readonly CyberpunkEvent[]; panelEvents: readonly CyberpunkPanelEvent[];
}): BeachPuckFlight {
  const { x,startY,endY,speedPerMs,tapTime } = input;
  if (![x,startY,endY,speedPerMs,tapTime].every(Number.isFinite) || speedPerMs<=0 || startY<=endY) throw new Error('Invalid cyberpunk flight');
  const zones=input.events.filter(e=>e.kind==='strip').map(e=>({
    ...CYBERPUNK_STRIPS[e.strip]!, begin:e.startMs+1000, end:Math.min(e.endMs,shutdown(e,input.panelEvents))
  })).filter(z=>z.end>z.begin);
  const segments: BeachFlightSegment[]=[];
  let y=startY, elapsed=0;
  while(y>endY+1e-8) {
    const time=tapTime+elapsed;
    const active=zones.some(z=>time>=z.begin && time<z.end && y<=z.y+z.height/2 && y>z.y-z.height/2 && x>=cyberpunkStripBounds(z,y-1e-7).left && x<=cyberpunkStripBounds(z,y-1e-7).right);
    const speed=speedPerMs*(active?.1:1);
    let nextY=endY;
    let nextTime=Infinity;
    for(const z of zones) {
      const sideCrossings=[z.x-z.width/2,z.x+z.width/2].filter(edge=>edge!==286).map(edge=>(x-286)*(z.y+300)/(edge-286)-300).filter(edge=>edge>=z.y-z.height/2 && edge<=z.y+z.height/2);
      for(const edge of [z.y+z.height/2,z.y-z.height/2,...sideCrossings]) if(edge<y-1e-8 && edge>nextY) nextY=edge;
      for(const edge of [z.begin,z.end]) if(edge>time+1e-8) nextTime=Math.min(nextTime,edge);
    }
    const dt=Math.min((y-nextY)/speed,nextTime-time);
    const toY=Math.max(endY,y-speed*dt);
    segments.push({fromY:y,toY,startMs:elapsed,endMs:elapsed+dt,speedPerMs:speed});
    y=toY; elapsed+=dt;
  }
  return {x,startY,stopY:endY,blocked:false,durationMs:elapsed,segments,
    arrivalMsAtY:(target:number)=>{
      if(target>startY || target<endY) return null;
      const s=segments.find(s=>target<=s.fromY && target>=s.toY);
      return s?s.startMs+(s.fromY-target)/s.speedPerMs:0;
    }};
}

import {type BonusChallengeEnvironmentRules,type BonusChallengeShotPause} from './bonusChallenge.js';
import {beachWindMotion} from './beachWind.js';
/** Reconstruct deferred stumble times solely from immutable rules and accepted pauses. */
export function cyberpunkEnvironmentForHistory(environment:BonusChallengeEnvironmentRules,pauses:readonly BonusChallengeShotPause[]):BonusChallengeEnvironmentRules {
 if(!environment.cyberpunk) return environment;
 const windows:{startMs:number;durationMs:number}[]=[];
 const fatigue=environment.fatigue;
 const cycle=fatigue?fatigue.stopStartMs+fatigue.stopDurationMs+fatigue.recoveryDurationMs:46000;
 for(let base=0;base<environment.cyberpunk.durationMs;base+=cycle) for(const offset of [10000,20000,30000]){
  let start=base+offset;
  for(let step=0;step<pauses.length+20;step++){
   const pause=pauses.find(p=>start<p.tapTime+p.flightMs && start+800>p.tapTime);
   if(pause){start=pause.tapTime+pause.flightMs;continue;}
   if(fatigue){const cycleStart=Math.floor(start/cycle)*cycle;const rest=cycleStart+fatigue.stopStartMs;
    if(start<rest+fatigue.stopDurationMs && start+800>rest){start=rest+fatigue.stopDurationMs;continue;}}
   break;
  }
  start=Math.max(start,(windows.at(-1)?.startMs??-800)+800);
  if(start+800<=environment.cyberpunk.durationMs) windows.push({startMs:start,durationMs:800});
 }
 return {...environment,stumbleWindows:windows};
}
export function cyberpunkShooterMotion(environment:BonusChallengeEnvironmentRules,time:number,frequency:number,pauses:readonly BonusChallengeShotPause[]):number {
 return beachWindMotion(cyberpunkEnvironmentForHistory(environment,pauses),time,frequency,pauses,[]);
}

export function cyberpunkEarliestTap(pauses:readonly BonusChallengeShotPause[]):number {
 const last=pauses.at(-1);return last?last.tapTime+last.flightMs:0;
}
