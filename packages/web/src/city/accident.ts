export type Accident={start:number;lane:0|1;policeLane:0|1;speedA:number;speedB:number;policeSpeed:number;impact:number;collisionAt:number;policeStart:number;policeArrived:number;departAt:number;end:number};
export type AccidentPhase='approach'|'waiting'|'police-approach'|'police-wait'|'departing'|'done';
export type AccidentSchedule={nextAt:number;event:Accident|null};
export const accidentCarWidth=3.6;
export function createAccident(now:number,random:()=>number=Math.random,preview=false):Accident{
 const lane=random()<.5?0:1;
 const speedA=120/(28+random()*22),speedB=120/(28+random()*22),policeSpeed=120/(30+random()*15);
 const collisionAt=now+(120-accidentCarWidth)/(speedA+speedB)*1000;
 const impact=-10+speedA*(collisionAt-now)/1000;
 const policeStart=collisionAt+(preview?5000:300000+random()*300000);
 const policeArrived=policeStart+(impact+10)/policeSpeed*1000;
 const departAt=policeArrived+(preview?5000:300000+random()*300000);
 const end=departAt+Math.max((impact+10)/speedA,(110-impact-accidentCarWidth)/speedB,(110-impact)/policeSpeed)*1000;
 return {start:now,lane,policeLane:lane===0?1:0,speedA,speedB,policeSpeed,impact,collisionAt,policeStart,policeArrived,departAt,end};
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
 return [e.start,e.collisionAt,e.policeStart,e.policeArrived,e.departAt,e.end,e.speedA,e.speedB,e.policeSpeed,e.impact].every(Number.isFinite)&&[0,1].includes(e.lane)&&e.policeLane===1-e.lane&&e.start<e.collisionAt&&e.collisionAt<e.policeStart&&e.policeStart<e.policeArrived&&e.policeArrived<e.departAt&&e.departAt<e.end&&e.end-e.start<3600000&&e.speedA>0&&e.speedB>0&&e.policeSpeed>0&&e.impact>0&&e.impact<100;
}
