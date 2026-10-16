import type {BarOccupantId} from '@hockey/game-core';

// Coordinates share the background's viewBox and cover projection.
const targets = {
 daria: {section:0,x:103,y:75,w:64,h:135,rx:32},
 grigory: {section:0,x:473,y:232,w:79,h:32,rx:9},
 maria: {section:0,x:853,y:224,w:100,h:32,rx:9},
 arsenich: {section:0,x:1512,y:260,w:84,h:86,rx:8},
 veronika: {section:1,x:1450,y:60,w:114,h:36,rx:7},
 igor: {section:2,x:550,y:500,w:73,h:24,rx:12},
} as const;
export function BarObjectGlow({character}:{character:BarOccupantId|null}) {
 if(!character || !(character in targets))return null;
 const target=targets[character as keyof typeof targets];
 const east=target.section===2;
 // East artwork uses a taller viewBox; compensate to match the other rings on screen.
 const radius=east?(55/3)*(1254/916):Math.max(32,Math.min(55,Math.max(target.w,target.h)*.48))/3;
 return <svg className="bar-space__object-glow" aria-hidden="true" viewBox={east?'0 0 1254 1254':'0 0 1717 916'} preserveAspectRatio="xMidYMid slice" style={{left:`${target.section*40}%`,width:east?'20%':'40%'}}>
  <circle data-bar-object-glow={character} cx={target.x+target.w/2} cy={target.y+target.h/2} r={radius} fill="none"/>
 </svg>;
}
