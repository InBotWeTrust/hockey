import { expect, it } from 'vitest';
import { createBlizzard, stepBlizzard, blizzardWind, BLIZZARD_TARGET } from '../src/caretaker/blizzard.js';
import { driftProgress } from '../src/caretaker/drift.js';
const idle = {x:0,y:0,held:false};
it('has three finite waves, deterministic moving snow and no automatic cleanup', () => {
 let a=createBlizzard('snow'), b=createBlizzard('snow');
 const planned=a.initialSnow;
 for(let i=0;i<3600;i++){a=stepBlizzard(a,idle);b=stepBlizzard(b,idle);}
 expect(a).toEqual(b);
 expect(a.flakes).toHaveLength(planned);
 expect(a.flakes.every(f=>f.status!==0)).toBe(true);
 expect(a.cleared).toBe(0);
 expect(blizzardWind(a).strength).toBe(0);
 expect(a.flakes.filter(f=>f.status===1||f.status===2).length).toBe(planned);
});
it('warns 0.7 seconds before a direction change',()=>{
 const state=createBlizzard('wind');
 expect(blizzardWind({...state,ticks:857}).warning).toBe(false);
 expect(blizzardWind({...state,ticks:858}).warning).toBe(true);
 expect(blizzardWind({...state,ticks:900}).warning).toBe(false);
});
it('collects at the scraper and only credits snow on delivery to the boards',()=>{
 let state=createBlizzard('collect');
 state={...state,x:300,y:400,angle:0,ticks:3600,initialSnow:1,flakes:[{x:357,y:400,wave:0,speed:1,status:1}]};
 state=stepBlizzard(state,{x:1,y:0,held:true});
 expect(state.flakes[0]?.status).toBe(2);
 expect(state.cleared).toBe(0);
 state=stepBlizzard({...state,x:540,y:400},{x:1,y:0,held:true});
 expect(state.flakes[0]?.status).toBe(3);
 expect(driftProgress(state)).toBe(1);
});
it('turns responsively and brakes quickly, distinct from drift',()=>{
 let s={...createBlizzard('move'),x:300,y:400,angle:0,vx:200,vy:0,ticks:3600};
 for(let i=0;i<15;i++)s=stepBlizzard(s,{x:0,y:-1,held:true});
 expect(s.vy).toBeLessThan(-180);
 expect(Math.abs(s.vx)).toBeLessThan(30);
 for(let i=0;i<30;i++)s=stepBlizzard(s,idle);
 expect(Math.hypot(s.vx,s.vy)).toBeLessThan(5);
 expect(BLIZZARD_TARGET).toBe(1);
});
it('can deliver every planned snow fragment after the finite storm',()=>{
 for(const seed of ['one','two','three']){
  let s=createBlizzard(seed);
  let retreat:{x:number;y:number}|undefined;
  for(let tick=0;tick<18000&&driftProgress(s)<1;tick++){
    const cargo=s.flakes.some(f=>f.status===2);
    let target:{x:number;y:number}|undefined;
    if(cargo){
      const edges=[{x:40,y:s.y},{x:560,y:s.y},{x:s.x,y:70},{x:s.x,y:740}];
      target=edges.sort((a,b)=>Math.hypot(a.x-s.x,a.y-s.y)-Math.hypot(b.x-s.x,b.y-s.y))[0];
    }else target=s.flakes.filter(f=>f.status===1).sort((a,b)=>Math.hypot(a.x-s.x,a.y-s.y)-Math.hypot(b.x-s.x,b.y-s.y))[0];
    if(!cargo && target && !retreat && Math.hypot(target.x-s.x,target.y-s.y)<75){
      const dx=s.x-target.x,dy=s.y-target.y,len=Math.hypot(dx,dy)||1;
      retreat={x:Math.max(120,Math.min(480,s.x+dx/len*150)),y:Math.max(200,Math.min(600,s.y+dy/len*150))};
    }
    if(retreat){if(Math.hypot(retreat.x-s.x,retreat.y-s.y)<25)retreat=undefined;else target=retreat;}
    const dx=target?target.x-s.x:0,dy=target?target.y-s.y:0,length=Math.hypot(dx,dy)||1;
    s=stepBlizzard(s,{x:dx/length,y:dy/length,held:!!target});
    expect(s.cleared+s.flakes.filter(f=>f.status!==3).length).toBe(s.initialSnow);
  }
  expect(driftProgress(s),JSON.stringify({x:s.x,y:s.y,angle:s.angle,cargo:s.flakes.filter(f=>f.status===2).length,left:s.flakes.filter(f=>f.status===1).slice(0,4)})).toBe(1);
 }
});

it('keeps gusts going for 54 seconds with short calm intervals',()=>{
 const s=createBlizzard('duration');
 expect(blizzardWind({...s,ticks:1500}).strength).toBeGreaterThan(0);
 expect(blizzardWind({...s,ticks:840}).strength).toBe(0);
 expect(blizzardWind({...s,ticks:1840}).strength).toBe(0);
 expect(blizzardWind({...s,ticks:3239}).strength).toBeGreaterThan(0);
 expect(blizzardWind({...s,ticks:3240}).strength).toBe(0);
});
it('a heavy cargo slows movement and turning without changing the empty scraper',()=>{
 const empty={...createBlizzard('load'),ticks:3600,x:300,y:400,angle:0,vx:0,vy:0};
 const heavy={...empty,flakes:empty.flakes.map((f,i)=>({...f,status:i<32?2:0}))};
 let a=empty,b=heavy;
 for(let tick=0;tick<15;tick++){
  a=stepBlizzard(a,{x:0,y:-1,held:true});
  b=stepBlizzard(b,{x:0,y:-1,held:true});
 }
 expect(Math.hypot(b.vx,b.vy)).toBeLessThan(Math.hypot(a.vx,a.vy)*.7);
 expect(Math.abs(b.angle)).toBeLessThan(Math.abs(a.angle));
});
it('a strong new crosswind sheds cargo once without undoing delivered snow',()=>{
 const base=createBlizzard('spill');
 const s={...base,ticks:1919,x:300,y:400,angle:-Math.PI/2,cleared:10,
  flakes:base.flakes.map((f,i)=>({...f,x:100,y:150,status:i<20?2:i<30?3:0}))};
 const after=stepBlizzard(s,{x:0,y:-1,held:true});
 expect(after.flakes.filter(f=>f.status===2)).toHaveLength(15);
 expect(after.flakes.filter(f=>f.status===1).length).toBeGreaterThanOrEqual(5);
 expect(after.cleared).toBe(10);
 expect(after.cleared+after.flakes.filter(f=>f.status!==3).length).toBe(base.initialSnow);
 const next=stepBlizzard(after,{x:0,y:-1,held:true});
 expect(next.flakes.filter(f=>f.status===2)).toHaveLength(15);
});
