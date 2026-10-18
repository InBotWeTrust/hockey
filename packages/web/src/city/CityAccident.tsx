import {useEffect,type CSSProperties} from 'react';
import {accidentWidth,accidentStageAt} from './accident.js';
import {accidentAssets} from './accidentAssets.js';
import {trafficAssets} from './trafficAssets.js';
import type {VisibleAccident} from './useCityAccident.js';
import './city-accident.css';
const bottoms=[19.5,17] as const;
export function CityAccident({incident}:{incident:VisibleAccident}){
 const {event,phase,sampledAt}=incident;
 useEffect(()=>{
  // Decode damage and police artwork while the cars are still approaching.
  for(const src of [accidentAssets[event.vehicleA??'sedan'],accidentAssets[event.vehicleB??'taxi'],accidentAssets.police]){const image=new Image();image.src=src;void image.decode?.().catch(()=>{});}
 },[event.start,event.vehicleA,event.vehicleB]);
 if(phase==='done')return null;
 const stage=accidentStageAt(event,sampledAt),elapsed=Math.max(0,(sampledAt-stage.start)/1000),depart=phase==='departing',approach=phase==='approach';
 const actor=(id:string,from:number,to:number,duration:number,lane:0|1,src:string,leftward:boolean,police=false,width=3.6)=><div key={id} data-testid={`accident-${id}`} className={`city-vehicle city-incident-car${leftward?' is-leftward':''}${police?' is-police':''}${!police&&!approach&&!depart?' has-hazards':''}${from!==to?' is-moving':''}${phase==='waiting'&&elapsed<.45&&!police?' has-impact':''}`} style={{width:`${width}%`,'--hazard-delay':`${-((sampledAt-event.collisionAt)%1000)/1000}s`,'--lane-bottom':`${bottoms[lane]}%`,'--impact-tilt':leftward?'-1.5deg':'1.5deg','--impact-recoil':leftward?'.35deg':'-.35deg','--incident-from':`${from}%`,'--incident-to':`${to}%`,'--incident-duration':`${duration}s`,'--incident-delay':`${-elapsed}s`,left:`${from}%`,zIndex:lane+1} as CSSProperties}>
  <img src={src} alt="" draggable={false}/><i className="city-headlights"/><i className="city-taillights"/>{police&&<span className="city-police-beacons"><i/><i/></span>}
 </div>;
 const modelA=event.vehicleA??'sedan',modelB=event.vehicleB??'taxi',widthA=accidentWidth(modelA);
 const duration=(event.collisionAt-event.start)/1000;
 return <div className="city-incident" data-testid="city-accident" data-phase={phase} key={`${event.start}:${phase}:${sampledAt}`}>
  {actor('sedan',approach?-10:event.impact,approach?event.impact:depart?-10:event.impact,approach?duration:(event.impact+10)/event.departSpeedA,event.lane,approach?trafficAssets[modelA]:accidentAssets[modelA],depart,false,accidentWidth(modelA))}
  {actor('taxi',approach?110:event.impact+widthA,approach?event.impact+widthA:depart?110:event.impact+widthA,approach?duration:(110-event.impact-widthA)/event.departSpeedB,event.lane,approach?trafficAssets[modelB]:accidentAssets[modelB],!depart,false,accidentWidth(modelB))}
  {phase==='waiting'&&elapsed<.24&&<span className="city-contact-burst" data-testid="accident-contact-burst" aria-hidden="true" style={{left:`${event.impact+widthA}%`,bottom:`calc(${bottoms[event.lane]}% + 1.5%)`,'--incident-delay':`${-elapsed}s`,zIndex:event.lane+2} as CSSProperties}><i/><i/><i/></span>}
  {['police-approach','police-wait','departing'].includes(phase)&&actor('police',phase==='police-approach'?-10:event.impact,phase==='police-approach'?event.impact:depart?110:event.impact,phase==='police-approach'?(event.policeArrived-event.policeStart)/1000:(110-event.impact)/event.departPoliceSpeed,event.policeLane,accidentAssets.police,false,true)}
 </div>;
}
