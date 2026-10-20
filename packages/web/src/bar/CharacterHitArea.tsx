import {useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import type {BarCharacter} from './conversationApi.js';
import {characterHitAreas,characterHitTransform} from './characterHitAreas.js';
export function CharacterHitArea({character,x,y,style,onGame}:{character:BarCharacter;x:number;y:number;style:CSSProperties;onGame?:(()=>void)|undefined}) {
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
     onClick={e=>{e.stopPropagation();onGame();}}
     onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();onGame();}}}>
    <circle cx="270" cy="480" r="65" fill="transparent" className="bar-space__bicep-hit"/>
    <circle cx="270" cy="480" r="60" fill="none" className="bar-space__bicep-glow" data-bar-object-glow="oleg"/>
   </g>}
  </g>
 </svg>;
}
