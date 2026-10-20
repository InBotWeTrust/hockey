import {useEffect,useRef,useState} from 'react';
import type {WeatherKind} from './weather.js';
import './weather.css';

type Flake={x:number;y:number;depth:number;radius:number;phase:number};
export function WeatherOverlay({weather}:{weather:WeatherKind}){
 const [paused,setPaused]=useState(document.hidden);
 useEffect(()=>{const update=()=>setPaused(document.hidden);document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update);},[]);
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const element=canvas.current;
  if(!element||(weather!=='snow'&&weather!=='blizzard'))return;
  const context=element.getContext('2d');
  if(!context)return;
  const storm=weather==='blizzard';
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  let width=0,height=0,last=0,elapsed=0;
  let frame:number|undefined;
  let flakes:Flake[]=[];
  const paint=(dt:number)=>{
   context.clearRect(0,0,width,height);
   const gust=storm?260+75*Math.sin(elapsed*.55):10+7*Math.sin(elapsed*.3);
   for(const flake of flakes){
    flake.x+=(gust*flake.depth+Math.sin(elapsed+flake.phase)*7)*dt;
    flake.y+=(storm?75+95*flake.depth:18+38*flake.depth)*dt;
    if(flake.y>height+16){flake.y=-16;flake.x=Math.random()*width;}
    if(flake.x>width+16)flake.x=-16;
    if(flake.x< -16)flake.x=width+16;
    context.globalAlpha=.22+.58*flake.depth;
    if(storm){
     context.strokeStyle='#f4f8ff';context.lineWidth=flake.radius*.8;context.lineCap='round';
     context.beginPath();context.moveTo(flake.x,flake.y);context.lineTo(flake.x-4-8*flake.depth,flake.y-2-3*flake.depth);context.stroke();
    }else{
     context.fillStyle='#f7fbff';context.beginPath();context.arc(flake.x,flake.y,flake.radius,0,Math.PI*2);context.fill();
    }
   }
   context.globalAlpha=1;
  };
  const tick=(now:number)=>{
   frame=undefined;
   if(document.hidden||motion.matches)return;
   if(last&&now-last<32){frame=requestAnimationFrame(tick);return;}
   const dt=last?Math.min((now-last)/1000,.05):0;last=now;elapsed+=dt;
   paint(dt);frame=requestAnimationFrame(tick);
  };
  const stop=()=>{if(frame!==undefined)cancelAnimationFrame(frame);frame=undefined;last=0;};
  const resume=()=>{
   stop();
   if(document.hidden)return;
   if(motion.matches)paint(0);else frame=requestAnimationFrame(tick);
  };
  const resize=()=>{
   const bounds=element.getBoundingClientRect();width=bounds.width;height=bounds.height;
   const dpr=Math.min(window.devicePixelRatio||1,1.5);
   element.width=Math.round(width*dpr);element.height=Math.round(height*dpr);context.setTransform(dpr,0,0,dpr,0,0);
   const count=Math.min(storm?150:85,Math.max(35,Math.round(width*height/(storm?3300:6500))));
   flakes=Array.from({length:count},()=>({x:Math.random()*width,y:Math.random()*height,depth:.25+Math.random()*.75,radius:.6+Math.random()*(storm?1.3:1.8),phase:Math.random()*Math.PI*2}));
   paint(0);resume();
  };
  const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(resize);
  observer?.observe(element);
  window.addEventListener('resize',resize);
  document.addEventListener('visibilitychange',resume);
  motion.addEventListener('change',resume);
  resize();
  return()=>{stop();observer?.disconnect();window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',resume);motion.removeEventListener('change',resume);};
 },[weather]);
 if(weather==='clear')return null;
 return <div className={`city-weather city-weather--${weather}`} data-weather={weather} data-paused={paused} aria-hidden="true">
  <div className="city-weather-tint"/>
  <div className="city-weather-haze city-weather-haze--back"/>
  <div className="city-weather-haze city-weather-haze--front"/>
  {(weather==='snow'||weather==='blizzard')&&<canvas ref={canvas}/>}
 </div>;
}
