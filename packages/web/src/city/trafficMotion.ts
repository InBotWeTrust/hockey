export type RoadSignal = 'green' | 'yellow' | 'red';
export type MovingVehicle = {lane:number;x:number;width:number;speed:number;leftward:boolean};
export function roadSignal(seconds:number):RoadSignal {
 const t=seconds%25;
 return t<12?'green':t<15?'yellow':'red';
}
export function advanceTraffic<T extends MovingVehicle>(vehicles:T[],delta:number,signal:RoadSignal):T[] {
 const next=vehicles.map(vehicle=>({...vehicle}));
 for(let lane=0;lane<4;lane++){
  const cars=next.filter(car=>car.lane===lane).sort((a,b)=>a.leftward?a.x-b.x:b.x-a.x);
  let leader:T|undefined;
  for(const car of cars){
   let x=car.x+(car.leftward?-1:1)*car.speed*delta;
   if(signal!=='green'){
    if(car.leftward&&car.x>=74.999)x=Math.max(75,x);
    if(!car.leftward&&car.x+car.width<=65.001)x=Math.min(65-car.width,x);
   }
   if(leader)x=car.leftward?Math.max(x,leader.x+leader.width+1.2):Math.min(x,leader.x-car.width-1.2);
   car.x=x;leader=car;
  }
 }
 return next.filter(car=>car.leftward?car.x+car.width>-12:car.x<112);
}
