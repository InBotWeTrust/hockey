import { useRef } from 'react';
import type { BarAction, BarOccupantId } from '@hockey/game-core';

const objects = [
  {x:100,y:65,w:70,h:150,action:'darts',character:'daria',label:'Играть в дартс с Дарьей'},
  {x:488,y:239,w:58,h:71,action:'ochko',character:'grigory',label:'Играть в очко с Григорием'},
  {x:856,y:211,w:91,h:77,action:'cards',character:'maria',label:'Играть в карты с Марией'},
  {x:1540,y:260,w:70,h:73,action:'checkers',character:'arsenich',label:'Играть в шашки с Арсеничем'},
] as const;

export function BarGameHotspots({onAction,onSwipe}: {onAction:(action:BarAction,character:BarOccupantId)=>void;onSwipe:(direction:number)=>void}) {
  const start = useRef<{x:number;y:number}|null>(null);
  const suppress = useRef(false);
  const groups = [objects,[{x:1420,y:30,w:190,h:480,action:'billiards',character:'veronika',label:'Играть в бильярд с Вероникой'}] as const];
  return <>{groups.map((group,index)=><svg key={index} className="bar-space__game-hotspots" viewBox="0 0 1717 916" preserveAspectRatio="xMidYMid slice" style={{left:`${index*40}%`}}>
    {group.map(object=><rect key={object.character} x={object.x} y={object.y} width={object.w} height={object.h} fill="transparent" role="button" tabIndex={0} aria-label={object.label}
      onPointerDown={e=>{e.stopPropagation();suppress.current=false;start.current={x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture?.(e.pointerId);}}
      onPointerMove={e=>{e.stopPropagation();const p=start.current;if(p&&Math.hypot(e.clientX-p.x,e.clientY-p.y)>12)suppress.current=true;}}
      onPointerUp={e=>{e.stopPropagation();const p=start.current;start.current=null;if(!p)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;suppress.current=suppress.current||Math.hypot(dx,dy)>12;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.3)onSwipe(dx<0?1:-1);}}
      onPointerCancel={()=>{start.current=null;suppress.current=true;}}
      onTouchStart={e=>e.stopPropagation()} onTouchEnd={e=>e.stopPropagation()}
      onClick={e=>{e.stopPropagation();if(suppress.current){suppress.current=false;return;}onAction(object.action,object.character);}}
      onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();onAction(object.action,object.character);}}}/>) }
  </svg>)}</>;
}
