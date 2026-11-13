export const incidentModels=['sedan','taxi','bus','compact','coupe','crossover','executive','hatchback','sedan-blue','suv','wagon','bus-red'];
export const modelWidth=model=>model.startsWith('bus')?7.5:model==='motorcycle'?2.4:model==='snowplow'?6:4.5;
export function createIncident(direction=1,episode=0){return {phase:'idle',age:0,departAge:0,direction,episode,leadModel:incidentModels[episode%incidentModels.length],rearModel:incidentModels[(episode+5)%incidentModels.length]};}
export function stepIncident(state,delta,signal){
 if(state.phase==='idle')return signal==='red'?{...state,phase:'braking',age:0}:state;
 const s={...state,age:state.age+delta};
 if(state.phase==='departing'){s.departAge+=delta;return s.departAge>=19?createIncident(-s.direction,s.episode+1):s;}
 s.phase=s.age<2?'braking':s.age<3?'closing':s.age<6?'waiting':s.age<11?'police':'investigating';
 if(s.age>=19&&signal==='green'){s.phase='departing';s.departAge=0;}return s;
}
export function incidentFrame(s){
 const d=s.direction,leadWidth=modelWidth(s.leadModel),rearWidth=modelWidth(s.rearModel),stop=d>0?65-leadWidth:75;
 const contact=d>0?stop-rearWidth+.12:stop+leadWidth-.12;
 let leadX=stop,rearX=contact;
 if(s.age<2){const remaining=2-s.age;leadX=stop-d*remaining*remaining*3;rearX=contact-d*(remaining*remaining*3+8);}
 else if(s.age<3)rearX=contact-d*(3-s.age)*8;
 if(s.phase==='departing'){leadX+=d*s.departAge*8;rearX+=d*Math.max(0,s.departAge-.8)*8;}
 const policeTarget=stop+d*5,policeStart=d>0?-10:110,policeProgress=Math.min(1,Math.max(0,(s.age-6)/5));
 const policeX=policeStart+(policeTarget-policeStart)*policeProgress+(s.phase==='departing'?d*Math.max(0,s.departAge-1.5)*9:0);
 return {active:s.phase!=='idle',phase:s.phase,direction:d,lane:d>0?3:0,policeLane:d>0?2:1,leadX,rearX,leadWidth,rearWidth,leadModel:s.leadModel,rearModel:s.rearModel,damaged:s.age>=3,police:s.age>=6,policeX,stopX:stop};
}
export function trafficAllowed(car,f){
 if(!f.active)return true;
 if(car.lane!==f.lane&&!(f.police&&car.lane===f.policeLane))return true;
 // Clear the incident corridor, including respawns: there is no following queue.
 return f.direction>0?car.x>Math.max(f.leadX,f.stopX)+f.leadWidth+2:car.x+car.width<Math.min(f.leadX,f.stopX)-2;
}

export function incidentActors(f,baselines){
 if(!f.active)return [];
 const mirror=f.direction<0;
 return [
 {id:(f.damaged?'accident-rear-':'traffic-')+f.leadModel,x:f.leadX,baseline:baselines[f.lane],width:f.leadWidth,mirror},
 {id:(f.damaged?'accident-':'traffic-')+f.rearModel,x:f.rearX,baseline:baselines[f.lane],width:f.rearWidth,mirror},
 ...(f.police?[{id:'accident-police',x:f.policeX,baseline:baselines[f.policeLane],width:4.5,mirror}]:[])
 ];
}
export function vehicleAspect(id,assets){
 const model=id.replace(/^accident-(?:rear-)?/,'');
 const asset=assets.find(a=>a.id==='extra-traffic-'+model)||assets.find(a=>a.id==='extra-'+id||a.id===id);
 if(!asset)return .45;const [x0,y0,x1,y1]=asset.bbox;return (y1-y0)/(x1-x0);
}
