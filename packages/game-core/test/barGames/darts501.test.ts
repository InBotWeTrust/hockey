import {expect,it} from 'vitest';
import * as darts from '../../src/barGames/darts.js';
import {createMatch,command,advance,DART_FLIGHT_MS,DART_IMPACT_MS,TURN_MS} from '../../src/barGames/runtime.js';
it('starts at 501, requires a double, and rolls back the entire visit on bust',()=>{
 let g=darts.create(0);expect(g.scores).toEqual([501,501]);
 g={...g,scores:[50,501],turnStartScore:50};
 g=darts.hit(g,{x:0,y:-.4});expect(g.scores[0]).toBe(30);
 g=darts.hit(g,{x:0,y:-.6});expect(g.scores[0]).toBe(50);expect(g.turn).toBe(1);expect(g.lastBust).toBe(true);
 const base={...darts.create(0),scores:[20,501] as [number,number],turnStartScore:20};
 expect(darts.hit(base,{x:0,y:-.4}).winner).toBeNull();
 const angle=Math.PI/10*6; // double ten
 expect(darts.hit(base,{x:Math.sin(angle)*.97,y:-Math.cos(angle)*.97}).winner).toBe(0);
});
it('scores against the rotated board',()=>{
 expect(darts.score({x:.6,y:0},90)).toBe(60);
});
it('spins once per visit, deterministically, and starts the next timer after the spin',()=>{
 let m=createMatch('darts',0,0,false,23);
 for(let i=0;i<3;i++)m=command(m,0,{type:'dart',gesture:{dx:0,dy:-.5,durationMs:400}},m.animationUntil+100);
 expect(m.dartRotation).toBeDefined();expect(m.dartRotation!.start).toBe(m.animationStart+DART_FLIGHT_MS+DART_IMPACT_MS);
 expect(m.dartRotation!.until).toBe(m.animationUntil);
 expect(m.deadline).toBe(m.dartRotation!.until+TURN_MS);
 expect(()=>command(m,1,{type:'dart',gesture:{dx:0,dy:-.5,durationMs:400}},m.animationUntil-1)).toThrow();
 expect(advance(m,m.animationUntil).game.turn).toBe(1);
});

it('keeps old 301 single-out matches playable without rotation',()=>{
 let m=createMatch('darts',0,0,false,7);m.engineVersion=8;
 if(m.game.kind!=='darts')throw Error('Expected darts');
 m.game={kind:'darts',turn:0,winner:null,scores:[20,301],dartsLeft:3,hits:[],lastScore:0};
 const next=command(m,0,{type:'dart',gesture:{dx:0,dy:-10/9,durationMs:400}},1000);
 expect(next.game.winner).toBe(0);expect(next.dartRotation).toBeUndefined();
});
it('rotates on timeout and repeats the same rotation for the same seed',()=>{
 const match=createMatch('darts',0,0,false,4);
 const first=advance(match,40000);
 expect(first).toEqual(advance(match,40000));
 expect(first.dartRotation?.start).toBe(40000);
 expect(first.deadline).toBe(first.dartRotation!.until+TURN_MS);
 expect(advance(createMatch('darts',0,0,false,1000000),40000).dartRotation?.to).not.toBe(first.dartRotation?.to);
});
it('prepares legal double-out finishes for every remaining score',()=>{
 for(let n=2;n<=501;n++){
   const p=darts.botTarget(n,true),points=darts.score(p);
   expect(n-points).not.toBe(1);
   expect(points).toBeLessThanOrEqual(n);
   if(points===n)expect(Math.hypot(p.x,p.y)>=.94||Math.hypot(p.x,p.y)===0).toBe(true);
 }
});
