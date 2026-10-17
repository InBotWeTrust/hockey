import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {trafficAssets} from './trafficAssets.js';
import './city-traffic.css';
type Model=keyof typeof trafficAssets;
const cars=(Object.keys(trafficAssets) as Model[]).filter(key=>!key.startsWith('bus'));
const buses:Model[]=['bus','bus-red'];
const bottoms=[19.5,17,13,8.5] as const;
export const trafficDelay=(random:()=>number=Math.random)=>40_000+random()*50_000+(random()>.88?60_000:0);
export function trafficChoice(random:()=>number=Math.random){
 const lane=Math.min(3,Math.floor(random()*4));
 const models=random()<.16?buses:cars;
 const model=models[Math.min(models.length-1,Math.floor(random()*models.length))]!;
 return {lane,leftward:lane>=2,bottom:bottoms[lane]!,duration:28+random()*22,model};
}
type Vehicle=ReturnType<typeof trafficChoice>&{id:number};
export function CityTraffic({night,preview=false}:{night:boolean;preview?:boolean}){
 const [vehicles,setVehicles]=useState<Vehicle[]>([]),[plane,setPlane]=useState(false),[paused,setPaused]=useState(document.hidden);
 const serial=useRef(0);
 useEffect(()=>{
  const motion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let stopped=false,carTimer:ReturnType<typeof setTimeout>|undefined,planeTimer:ReturnType<typeof setTimeout>|undefined;
  const enabled=()=>!document.hidden&&!motion?.matches;
  const spawn=()=>{if(stopped)return;if(enabled()){
   const choice=trafficChoice();setVehicles(previous=>previous.some(v=>v.lane===choice.lane)?previous:[...previous,{...choice,id:++serial.current}]);
  }carTimer=setTimeout(spawn,preview?6000:trafficDelay());};
  const fly=()=>{if(stopped)return;if(enabled())setPlane(true);planeTimer=setTimeout(fly,(480+Math.random()*420)*1000);};
  const visibility=()=>setPaused(!enabled());
  document.addEventListener('visibilitychange',visibility);motion?.addEventListener('change',visibility);visibility();
  carTimer=setTimeout(spawn,preview?100:trafficDelay());planeTimer=setTimeout(fly,preview?100:(480+Math.random()*420)*1000);
  return()=>{stopped=true;clearTimeout(carTimer);clearTimeout(planeTimer);document.removeEventListener('visibilitychange',visibility);motion?.removeEventListener('change',visibility);};
 },[preview]);
 return <div className={`city-traffic${night?' is-night':''}${paused?' is-paused':''}`} aria-hidden="true">
  {vehicles.map(vehicle=><div key={vehicle.id} data-testid="city-vehicle" className={`city-vehicle${vehicle.leftward?' is-leftward':''}${vehicle.model.startsWith('bus')?' is-bus':''}`} style={{'--lane-bottom':`${vehicle.bottom}%`,'--travel':`${vehicle.duration}s`,zIndex:vehicle.lane+1} as CSSProperties} onAnimationEnd={event=>{if(event.target===event.currentTarget)setVehicles(previous=>previous.filter(v=>v.id!==vehicle.id));}}>
   <img src={trafficAssets[vehicle.model]} alt="" draggable={false}/><i className="city-headlights"/><i className="city-taillights"/><span className="city-exhaust"><i/><i/><i/></span>
  </div>)}
  {plane&&<div className="city-plane" onAnimationEnd={()=>setPlane(false)}><img src="/sprites/city-plane-687338bfb4c3.webp" alt="" draggable={false}/></div>}
 </div>;
}
