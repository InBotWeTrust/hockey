import {useEffect,type CSSProperties} from 'react';
import {accidentCarWidth,accidentStageAt} from './accident.js';
import {accidentAssets} from './accidentAssets.js';
import {trafficAssets} from './trafficAssets.js';
import type {VisibleAccident} from './useCityAccident.js';
import './city-accident.css';
const bottoms=[19.5,17] as const;
export function CityAccident({incident}:{incident:VisibleAccident}){
 const {event,phase,sampledAt}=incident;
 useEffect(()=>{
  // Decode damage and police artwork while the cars are still approaching.
  for(const src of Object.values(accidentAssets)){const image=new Image();image.src=src;void image.decode?.().catch(()=>{});}
 },[event.start]);
 if(phase==='done')return null;
 const stage=accidentStageAt(event,sampledAt),elapsed=Math.max(0,(sampledAt-stage.start)/1000),depart=phase==='departing',approach=phase==='approach';
 const actor=(id:string,from:number,to:number,duration:number,lane:0|1,src:string,leftward:boolean,police=false)=><div key={id} data-testid={`accident-${id}`} className={`city-vehicle city-incident-car${leftward?' is-leftward':''}${police?' is-police':''}${from!==to?' is-moving':''}`} style={{'--lane-bottom':`${bottoms[lane]}%`,'--incident-from':`${from}%`,'--incident-to':`${to}%`,'--incident-duration':`${duration}s`,'--incident-delay':`${-elapsed}s`,left:`${from}%`,zIndex:lane+1} as CSSProperties}>
  <img src={src} alt="" draggable={false}/><i className="city-headlights"/><i className="city-taillights"/>{police&&<span className="city-police-beacons"><i/><i/></span>}
 </div>;
 const duration=(event.collisionAt-event.start)/1000;
 return <div className="city-incident" data-testid="city-accident" data-phase={phase} key={`${event.start}:${phase}:${sampledAt}`}>
  {actor('sedan',approach?-10:event.impact,approach?event.impact:depart?-10:event.impact,approach?duration:(event.impact+10)/event.departSpeedA,event.lane,approach?trafficAssets.sedan:accidentAssets.sedan,depart)}
  {actor('taxi',approach?110:event.impact+accidentCarWidth,approach?event.impact+accidentCarWidth:depart?110:event.impact+accidentCarWidth,approach?duration:(110-event.impact-accidentCarWidth)/event.departSpeedB,event.lane,approach?trafficAssets.taxi:accidentAssets.taxi,!depart)}
  {['police-approach','police-wait','departing'].includes(phase)&&actor('police',phase==='police-approach'?-10:event.impact,phase==='police-approach'?event.impact:depart?110:event.impact,phase==='police-approach'?(event.policeArrived-event.policeStart)/1000:(110-event.impact)/event.departPoliceSpeed,event.policeLane,accidentAssets.police,false,true)}
 </div>;
}
