import {useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import type {BarCharacter} from './conversationApi.js';
import {characterHitAreas,characterHitTransform} from './characterHitAreas.js';
export function CharacterHitArea({character,x,y,style}:{character:BarCharacter;x:number;y:number;style:CSSProperties}) {
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
  <path data-bar-character={character} d={characterHitAreas[character]} transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}/>
 </svg>;
}
