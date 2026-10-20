import {trafficAssets} from './trafficAssets.js';
export type AccidentModel=keyof typeof trafficAssets;
export const accidentModels=Object.keys(trafficAssets) as AccidentModel[];
export const accidentWidth=(model:AccidentModel)=>model.startsWith('bus')?7:3.6;
export type Accident={vehicleA?:AccidentModel;vehicleB?:AccidentModel;start:number;lane:0|1;policeLane:0|1;speedA:number;speedB:number;policeSpeed:number;departSpeedA:number;departSpeedB:number;departPoliceSpeed:number;impact:number;collisionAt:number;policeStart:number;policeArrived:number;departAt:number;end:number};
export type AccidentPhase='approach'|'waiting'|'police-approach'|'police-wait'|'departing'|'done';
export type AccidentSchedule={nextAt:number;event:Accident|null};
export const accidentCarWidth=3.6;
export function createAccident(now:number,random:()=>number=Math.random,preview=false):Accident{
 const vehicleA=accidentModels[Math.min(accidentModels.length-1,Math.floor(random()*accidentModels.length))]!;
 const others=accidentModels.filter(model=>model!==vehicleA);
 const vehicleB=others[Math.min(others.length-1,Math.floor(random()*others.length))]!;
 const widthA=accidentWidth(vehicleA);
 const lane=random()<.5?0:1;
 const speedA=120/(28+random()*22),speedB=120/(28+random()*22),policeSpeed=120/(30+random()*15);
 const collisionAt=now+(120-widthA)/(speedA+speedB)*1000;
 const impact=-10+speedA*(collisionAt-now)/1000;
 const policeStart=collisionAt+(preview?5000:300000+random()*300000);
 const policeArrived=policeStart+(impact+10)/policeSpeed*1000;
 const departAt=policeArrived+(preview?5000:300000+random()*300000);
 // Separate speed bands guarantee a visible difference; shuffle which car gets each band.
 const departureSpeeds=[1.7+random()*.6,2.6+random()*.6,3.5+random()*.6];
 for(let index=2;index>0;index--){const other=Math.floor(random()*(index+1));[departureSpeeds[index],departureSpeeds[other]]=[departureSpeeds[other]!,departureSpeeds[index]!];}
 const [departSpeedA,departSpeedB,departPoliceSpeed]=departureSpeeds as [number,number,number];
 const end=departAt+Math.max((impact+10)/departSpeedA,(110-impact-widthA)/departSpeedB,(110-impact)/departPoliceSpeed)*1000;
 return {vehicleA,vehicleB,start:now,lane,policeLane:lane===0?1:0,speedA,speedB,policeSpeed,departSpeedA,departSpeedB,departPoliceSpeed,impact,collisionAt,policeStart,policeArrived,departAt,end};
}
export const nextAccidentAt=(event:Accident,random:()=>number=Math.random)=>event.start+(48+random()*12)*3600000;
export function accidentStageAt(event:Accident,now:number):{phase:AccidentPhase;start:number;end:number}{
 const phases:[AccidentPhase,number,number][]=[['approach',event.start,event.collisionAt],['waiting',event.collisionAt,event.policeStart],['police-approach',event.policeStart,event.policeArrived],['police-wait',event.policeArrived,event.departAt],['departing',event.departAt,event.end]];
 const stage=phases.find(([,start,end])=>now>=start&&now<end);
 return stage?{phase:stage[0],start:stage[1],end:stage[2]}:{phase:'done',start:event.end,end:event.end};
}
export function validAccident(event:unknown):event is Accident{
 if(!event||typeof event!=='object')return false;
 const e=event as Accident;
 return (e.vehicleA===undefined||accidentModels.includes(e.vehicleA))&&(e.vehicleB===undefined||accidentModels.includes(e.vehicleB))&&[e.start,e.collisionAt,e.policeStart,e.policeArrived,e.departAt,e.end,e.speedA,e.speedB,e.policeSpeed,e.departSpeedA,e.departSpeedB,e.departPoliceSpeed,e.impact].every(Number.isFinite)&&[0,1].includes(e.lane)&&e.policeLane===1-e.lane&&e.start<e.collisionAt&&e.collisionAt<e.policeStart&&e.policeStart<e.policeArrived&&e.policeArrived<e.departAt&&e.departAt<e.end&&e.end-e.start<3600000&&e.speedA>0&&e.speedB>0&&e.policeSpeed>0&&e.departSpeedA>0&&e.departSpeedB>0&&e.departPoliceSpeed>0&&e.impact>0&&e.impact<100;
}
