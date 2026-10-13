import {useEffect,useState} from 'react';
import {cyberpunkStripBounds,CYBERPUNK_STRIPS,type sampleCyberpunkEnvironment} from '@hockey/game-core';
import {projectBeachWaterY} from './beachWaterVisuals';
type Scene=ReturnType<typeof sampleCyberpunkEnvironment>;
export function CyberpunkEffects({scene,layer,onTap,busy=false}:{scene:Scene;layer:'ice'|'panel';onTap?:()=>void;busy?:boolean}){
 if(layer==='panel') return <CyberpunkPanel scene={scene} onTap={onTap} busy={busy}/>;
 const event=scene.activeStrip??scene.warningStrip;
 const strip=event?CYBERPUNK_STRIPS[event.strip]:null;
 return <div className={`cyberpunk-ice ${scene.outage?'cyberpunk-ice--dark':''} ${scene.outageWarning?'cyberpunk-ice--flicker':''}`} aria-hidden="true">
  <div className="cyberpunk-emergency-shade"/>
  {strip&&<svg viewBox="0 0 572 700" preserveAspectRatio="none" className={`cyberpunk-strip ${scene.activeStrip?'cyberpunk-strip--active':''}`}>
   <polygon points={[
    [cyberpunkStripBounds(strip,strip.y-strip.height/2).left,projectBeachWaterY(strip.y-strip.height/2)],
    [cyberpunkStripBounds(strip,strip.y-strip.height/2).right,projectBeachWaterY(strip.y-strip.height/2)],
    [cyberpunkStripBounds(strip,strip.y+strip.height/2).right,projectBeachWaterY(strip.y+strip.height/2)],
    [cyberpunkStripBounds(strip,strip.y+strip.height/2).left,projectBeachWaterY(strip.y+strip.height/2)],
   ].map(point=>point.join(',')).join(' ')}/>
   <path d={`M ${strip.x-strip.width/2+8} ${projectBeachWaterY(strip.y)} h ${strip.width-16}`}/>
  </svg>}
 </div>;
}

function CyberpunkPanel({scene,onTap,busy}:{scene:Scene;onTap:(()=>void)|undefined;busy:boolean}) {
 const event=scene.activeStrip??scene.warningStrip;
 const [last,setLast]=useState(event);
 const [entered,setEntered]=useState(false);
 useEffect(()=>{if(event)setLast(event);},[event]);
 useEffect(()=>{
  if(!event){setEntered(false);return;}
  const timer=setTimeout(()=>setEntered(true),20);
  return()=>clearTimeout(timer);
 },[event?.id]);
 const shown=event??last;
 if(!shown)return null;
 const hash=Array.from(shown.id).reduce((value,char)=>((value*31+char.charCodeAt(0))>>>0),shown.strip);
 const side=hash%2?'right':'left';
 return <div className={`cyberpunk-panel cyberpunk-panel--${side} ${event?'cyberpunk-panel--visible':''} ${entered&&event?'cyberpunk-panel--entered':''}`} style={{top:`${46+(hash%3)*7}%`}} aria-hidden={!event}>
  <button type="button" className="cyberpunk-breaker" disabled={!scene.activeStrip||busy} tabIndex={event?0:-1}
   aria-label={`Отключить полосу: осталось ${scene.remainingTaps} нажатия`}
   onClick={click=>{click.stopPropagation();onTap?.();}}>
   <img src="/bonus-games/effects/cyberpunk-breaker.png" alt="" draggable={false}/>
   <span className="cyberpunk-breaker__leds" aria-hidden="true">{[0,1,2].map(n=><i key={n} className={n<scene.remainingTaps?'lit':''}/>)}</span>
  </button>
 </div>;
}
