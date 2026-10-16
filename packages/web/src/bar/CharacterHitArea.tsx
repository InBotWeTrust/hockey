import {useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import type {BarCharacter} from './conversationApi.js';
import {characterHitAreas,characterHitTransform} from './characterHitAreas.js';
export function CharacterHitArea({character,x,y,style,onGame,onSwipe}:{character:BarCharacter;x:number;y:number;style:CSSProperties;onGame?:(()=>void)|undefined;onSwipe?:(direction:number)=>void}) {
 const gesture=useRef<{x:number;y:number}|null>(null);
 const suppress=useRef(false);
 const ref=useRef<SVGSVGElement>(null);
 const [size,setSize]=useState({width:1024,height:1536});
 useLayoutEffect(()=>{
  const el=ref.current;if(!el)return;
  const measure=()=>{const {width,height}=el.getBoundingClientRect();if(width>0&&height>0)setSize({width,height});};
  measure();if(typeof ResizeObserver==='undefined')return;
  const observer=new ResizeObserver(measure);observer.observe(el);return ()=>observer.disconnect();
 },[]);
 const transform=characterHitTransform(size.width,size.height,x,y);
 return <svg ref={ref} className="bar-space__character-hit" viewBox={`0 0 ${size.width} ${size.height}`} style={style}>
  <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}>
   <path data-bar-character={character} d={characterHitAreas[character]}/>
   {onGame && <g role="button" tabIndex={0} aria-label="Играть в армрестлинг с Олегом"
     onPointerDown={e=>{e.stopPropagation();gesture.current={x:e.clientX,y:e.clientY};suppress.current=false;e.currentTarget.setPointerCapture?.(e.pointerId);}}
     onPointerMove={e=>{e.stopPropagation();if(gesture.current&&Math.hypot(e.clientX-gesture.current.x,e.clientY-gesture.current.y)>12)suppress.current=true;}}
     onPointerUp={e=>{e.stopPropagation();const p=gesture.current;gesture.current=null;if(!p)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;suppress.current=suppress.current||Math.hypot(dx,dy)>12;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.3)onSwipe?.(dx<0?1:-1);}}
     onPointerCancel={()=>{gesture.current=null;suppress.current=true;}}
     onTouchStart={e=>e.stopPropagation()} onTouchEnd={e=>e.stopPropagation()}
     onClick={e=>{e.stopPropagation();if(suppress.current){suppress.current=false;return;}onGame();}}
     onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();onGame();}}}>
    <circle cx="270" cy="480" r="65" fill="transparent" className="bar-space__bicep-hit"/>
    <circle cx="270" cy="480" r="60" fill="none" className="bar-space__bicep-glow" data-bar-object-glow="oleg"/>
   </g>}
  </g>
 </svg>;
}
