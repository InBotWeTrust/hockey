export const MIN = .1;
export const MAX = .9;
export const GAP = .34;
const players=[0,1] as const;
/** Collision stops approach; skating never displaces a stationary opponent. */
export function moveResponsivePositions(positions:[number,number],velocities:readonly number[],duration:number):void {
 let remaining=duration;
    for(let n=0;remaining>1e-7&&n<6;n++){
      const v=velocities.map((original,i)=>{let speed=original;
        if((positions[i]!<=MIN+1e-9&&speed<0)||(positions[i]!>=MAX-1e-9&&speed>0))speed=0;return speed;});
      if(positions[1]-positions[0]<=GAP+1e-9&&v[0]!>v[1]!){const shared=v[0]!>0&&v[1]!>0?Math.min(v[0]!,v[1]!):v[0]!<0&&v[1]!<0?Math.max(v[0]!,v[1]!):0;v[0]=shared;v[1]=shared;}
      let dt=remaining;players.forEach(i=>{if(v[i]!<0)dt=Math.min(dt,(MIN-positions[i])/v[i]!);if(v[i]!>0)dt=Math.min(dt,(MAX-positions[i])/v[i]!);});
      if(v[0]!>v[1]!)dt=Math.min(dt,Math.max(0,(positions[1]-positions[0]-GAP)/(v[0]!-v[1]!)));
      players.forEach(i=>positions[i]+=v[i]!*dt);remaining-=dt;
    }
}
