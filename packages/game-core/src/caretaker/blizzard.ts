import { createRng } from '../rng.js';
import { createDrift, DRIFT_DT, type DriftState, type DriftControl } from './drift.js';
export const BLIZZARD_VERSION = 2;
export const BLIZZARD_TARGET = 1;
export const BLIZZARD_STORM_TICKS = 3240;
export interface BlizzardFlake {
  x: number; y: number; wave: number; speed: number;
  /** 0 planned, 1 loose, 2 collected, 3 delivered. */
  status: number;
  bounceX?: number; bounceY?: number;
  pickupAfter?: number;
}
export interface BlizzardState extends DriftState {
  variant: 'blizzard'; flakes: BlizzardFlake[]; windSign: number;
  spilled: number; spillUntil: number;
}
const phases = [
  {start:60,end:780,x:1,y:0,strength:0.7},
  {start:900,end:1320,x:-1,y:0.22,strength:1.1},
  {start:1320,end:1740,x:0.8,y:-0.6,strength:1.1},
  {start:1920,end:2340,x:-0.85,y:0.52,strength:1.6},
  {start:2340,end:2760,x:1,y:-0.15,strength:1.6},
  {start:2760,end:BLIZZARD_STORM_TICKS,x:-0.8,y:-0.6,strength:1.6},
];
export function blizzardWind(state: BlizzardState) {
  const phase = phases.find(p=>state.ticks>=p.start && state.ticks<p.end);
  const next = phases.find(p=>p.start>state.ticks);
  return {x:(phase?.x??0)*state.windSign,y:phase?.y??0,strength:phase?.strength??0,
    gust:phase?phases.indexOf(phase):-1,
    warning:!!next && next.start-state.ticks<=42,
    nextX:(next?.x??0)*state.windSign,nextY:next?.y??0,
    wave:state.ticks<900?1:state.ticks<1920?2:3};
}
export function createBlizzard(seed: string): BlizzardState {
  const rng=createRng(seed), flakes:BlizzardFlake[]=[];
  for(let wave=0;wave<3;wave++) for(let band=0;band<(wave===0?2:3);band++) {
    const y=180+band*180+(wave===0?90:0);
    const x=130+rng.next()*270;
    for(let i=0;i<20;i++) flakes.push({x:x+(i-10)*10,y:y+(rng.next()-.5)*30,
      wave,speed:0.8+rng.next()*0.4,status:wave===0?1:0});
  }
  return {...createDrift(seed),variant:'blizzard',snow:Array<number>(3072).fill(0),
    initialSnow:flakes.length,cleared:0,spilled:0,spillUntil:0,flakes,windSign:rng.next()<0.5?-1:1};
}
export function isBlizzard(state: DriftState): state is BlizzardState {
  return 'variant' in state && state.variant==='blizzard';
}
function distance(x:number,y:number,ax:number,ay:number,bx:number,by:number){
 const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));
 return Math.hypot(x-ax-t*dx,y-ay-t*dy);
}
export function stepBlizzard(previous: BlizzardState, input: DriftControl): BlizzardState {
  const s:BlizzardState={...previous,ticks:previous.ticks+1,collision:0,scatter:[],spilled:0,
    flakes:previous.flakes.map(f=>({...f}))};
  const length=Math.hypot(input.x,input.y);
  const held=input.held&&Number.isFinite(length)&&length>0.05;
  const wind=blizzardWind(s),previousWind=blizzardWind(previous);
  const previousCargo=previous.flakes.filter(f=>f.status===2).length;
  const load=Math.min(1,previousCargo/32);
  const speed=270*(1-load*.48), response=1-Math.exp(-(12-load*6)*DRIFT_DT);
  const dx=held?input.x/length:0,dy=held?input.y/length:0;
  s.vx+=(dx*speed+wind.x*wind.strength*60-s.vx)*response;
  s.vy+=(dy*speed+wind.y*wind.strength*60-s.vy)*response;
  if(held){
    const delta=Math.atan2(Math.sin(Math.atan2(dy,dx)-s.angle),Math.cos(Math.atan2(dy,dx)-s.angle));
    const turn=12*(1-load*.6)*DRIFT_DT;
    s.angle+=Math.max(-turn,Math.min(turn,delta));
  }
  s.x+=s.vx*DRIFT_DT;s.y+=s.vy*DRIFT_DT;
  const c=Math.cos(s.angle),sn=Math.sin(s.angle);
  const xs=[c*54-sn*60,c*54+sn*60,-c*105-sn*32,-c*105+sn*32];
  const ys=[sn*54+c*60,sn*54-c*60,-sn*105+c*32,-sn*105-c*32];
  const minX=-Math.min(...xs),maxX=600-Math.max(...xs);
  s.x=Math.max(minX,Math.min(maxX,s.x));
  const minY=65*((s.x-300)/300)**2-Math.min(...ys),maxY=800-Math.max(...ys);
  s.y=Math.max(minY,Math.min(maxY,s.y));
  const wave=wind.wave-1;
  const bladeX=s.x+c*54,bladeY=s.y+sn*54;
  const oldX=previous.x+Math.cos(previous.angle)*54,oldY=previous.y+Math.sin(previous.angle)*54;
  const crosswind=Math.abs(wind.x*sn-wind.y*c)*wind.strength;
  const spillCount=wind.gust!==previousWind.gust&&wind.gust>=0&&wind.strength>=1.4&&crosswind>.8&&previousCargo>=12
    ? Math.ceil(previousCargo*.25):0;
  const spillSide=Math.sign(-sn*wind.x+c*wind.y)||1;
  let cargo=0;
  for(const f of s.flakes){
    if(f.status===2&&s.spilled<spillCount){
      f.status=1;
      const spread=90+(s.spilled%5)*12;
      f.x=Math.max(80,Math.min(520,bladeX-sn*spillSide*spread+c*25));
      f.y=Math.max(145,Math.min(670,bladeY+c*spillSide*spread+sn*25));
      f.pickupAfter=s.ticks+60;
      s.spilled++;s.spillUntil=s.ticks+90;
    }
    if(f.status===0&&f.wave<=wave)f.status=1;
    if(f.status===1){
      if(wind.gust!==previousWind.gust){f.bounceX=1;f.bounceY=1;}
      f.x+=wind.x*wind.strength*210*f.speed*DRIFT_DT*(f.bounceX??1);
      f.y+=wind.y*wind.strength*210*f.speed*DRIFT_DT*(f.bounceY??1);
      // Wind curls back from the boards instead of collapsing every flake into one corner.
      if(f.x<80||f.x>520){f.x=Math.max(80,Math.min(520,f.x));f.bounceX=-(f.bounceX??1);}
      if(f.y<145||f.y>670){f.y=Math.max(145,Math.min(670,f.y));f.bounceY=-(f.bounceY??1);}
      // Sweep both blade positions so quick turns still intercept moving strips.
      if(held && s.ticks>=(f.pickupAfter??0) && (distance(f.x,f.y,bladeX-sn*60,bladeY+c*60,bladeX+sn*60,bladeY-c*60)<19 ||
         distance(f.x,f.y,oldX-sn*60,oldY+c*60,oldX+sn*60,oldY-c*60)<19)) f.status=2;
    }
    if(f.status===2){
      if(held && (bladeX<=80||bladeX>=520||bladeY<=125||bladeY>=710)){f.status=3;s.cleared++;}
      else {
        const side=((cargo%9)-4)*10,front=Math.floor(cargo/9)*5;
        f.x=bladeX-sn*side+c*front;f.y=bladeY+c*side+sn*front;cargo++;
      }
    }
  }
  return s;
}
