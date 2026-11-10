export function signalPhase(time) {
  const t = time % 25;
  return t < 12 ? 'green' : t < 15 ? 'yellow' : 'red';
}
const models=['sedan-blue','bus-red','suv','taxi','compact','coupe','crossover','executive','hatchback','sedan','wagon','bus','motorcycle','snowplow'];
const ordinary=models.filter(model=>!model.startsWith('bus')&&!['motorcycle','snowplow'].includes(model));
const widthOf=model=>model.startsWith('bus')?7.5:model==='motorcycle'?2.4:model==='snowplow'?6:4.5;
function driver(model,lane,random) {
  const range=model==='snowplow'?[3.8,5]:model.startsWith('bus')?[4.8,6.3]:model==='motorcycle'?[7.2,9.3]:[5.2,8.7];
  return {speed:(range[0]+random()*(range[1]-range[0]))*([.96,1.04,1.04,.96][lane]),launchDelay:.18+random()*.85,headway:1.5+random()*.9};
}
function chooseModel(random){const roll=random();return roll<.025?'snowplow':roll<.09?'motorcycle':roll<.20?(random()<.5?'bus':'bus-red'):ordinary[Math.min(ordinary.length-1,Math.floor(random()*ordinary.length))];}
export function createVehicles(random=Math.random) {
  const bag=[...models];
  for(let i=bag.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}
  const fleet=[];let id=0;
  for(let lane=0;lane<4;lane++){
    const direction=lane<2?-1:1;let x=direction<0?30+random()*38:42+random()*30;
    for(let index=0;index<(lane%2?3:4);index++){
      const model=bag[id],settings=driver(model,lane,random);
      fleet.push({id:id++,model,lane,x,width:widthOf(model),direction,...settings,velocity:settings.speed,spawnWait:0});
      x-=direction*(19+random()*20);
    }
  }
  return fleet;
}
export function stepVehicles(vehicles,delta,phase,stops={right:65,left:75},random=Math.random) {
  const result=vehicles.map(car=>({...car}));
  for(let lane=0;lane<4;lane++){
    const cars=result.filter(car=>car.lane===lane).sort((a,b)=>(b.x-a.x)*a.direction);
    let leader;
    for(const car of cars){
      if(car.spawnWait>0){car.spawnWait=Math.max(0,car.spawnWait-delta);car.velocity=0;leader=car;continue;}
      let target=car.speed;
      const stopDistance=car.direction>0?stops.right-car.width-car.x:car.x-stops.left;
      if(phase!=='green'&&stopDistance>=-.001)target=Math.min(target,Math.sqrt(Math.max(0,stopDistance)*7));
      if(leader){
        const gap=car.direction>0?leader.x-car.x-car.width:car.x-leader.x-leader.width;
        target=Math.min(target,Math.max(0,(leader.velocity??leader.speed)+Math.max(0,gap-(car.headway??1.5))*1.1));
        if(gap<=(car.headway??1.5))target=0;
      }
      if(car.wasStopped&&phase==='green'){
        car.restartWait=car.restartWait??car.launchDelay??0;
        car.restartWait=Math.max(0,car.restartWait-delta);
        if(car.restartWait>0)target=0;else car.wasStopped=false;
      }
      const previous=car.velocity??car.speed;
      const velocity=previous<target?Math.min(target,previous+2.4*delta):Math.max(target,previous-4.5*delta);
      let next=car.x+velocity*delta*car.direction;
      if(phase!=='green'&&stopDistance>=-.001){
        next=car.direction>0?Math.min(next,stops.right-car.width):Math.max(next,stops.left);
        if(stopDistance<.025)next=car.direction>0?stops.right-car.width:stops.left;
      }
      if(leader)next=car.direction>0?Math.min(next,leader.x-car.width-1.2):Math.max(next,leader.x+leader.width+1.2);
      car.velocity=Math.max(0,(next-car.x)*car.direction/Math.max(delta,.000001));
      car.x=next;
      if(car.velocity<.03&&phase!=='green'){car.wasStopped=true;car.restartWait=undefined;}
      leader=car;
    }
    for(const car of cars){
      if((car.direction>0&&car.x>112)||(car.direction<0&&car.x+car.width<-12)){
        car.model=chooseModel(random);car.width=widthOf(car.model);Object.assign(car,driver(car.model,lane,random));
        const others=cars.filter(other=>other!==car),gap=10+random()*22;
        car.x=car.direction>0?Math.min(-12,...others.map(other=>other.x-car.width-gap)):Math.max(112,...others.map(other=>other.x+other.width+gap));
        car.spawnWait=1.5+random()*5+(random()<.18?6+random()*6:0);car.velocity=0;car.wasStopped=false;car.restartWait=undefined;
      }
    }
  }
  return result;
}

export const laneBaselines = [82.5, 86, 91.5, 94.8];

export function vehiclePaintOrder(actors) {
  return [...actors].sort((a, b) => a.baseline - b.baseline);
}

// Tire contact within the cropped sprite; buses include deeper shadows below it.
export function vehicleWheelAnchor(id) {
  return ({"traffic-bus": .93, "traffic-bus-red": .84})[id] ?? 1;
}
