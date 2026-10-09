import { useEffect, useRef, useState } from 'react';
import { Heart, Shield } from 'lucide-react';
export function FightReserve({kind,value,total}:{kind:'health'|'guard';value:number;total:number}):JSX.Element {
 const previous=useRef(value);
 const [changedUnits,setChangedUnits]=useState<number[]>([]);
 useEffect(()=>{const old=previous.current;previous.current=value;
   const changed=Array.from({length:total},(_,i)=>i).filter(i=>(i<value)!==(i<old));
   if(!changed.length)return;setChangedUnits(changed);
   const timeout=window.setTimeout(()=>setChangedUnits([]),300);return()=>window.clearTimeout(timeout);
 },[value,total]);
 const Icon=kind==='health'?Heart:Shield;
 return <div className={`fight-reserve fight-reserve--${kind}`} aria-label={`${kind==='health'?'Здоровье':'Запас блока'}: ${value} из ${total}`}>
 {Array.from({length:total},(_,i)=>{const full=i<value;const changed=changedUnits.includes(i);return <span key={`${i}-${full}`} className={`${full?'is-filled':'is-empty'}${changed?' is-changing':''}`}><Icon size={12} aria-hidden="true"/></span>;})}
 </div>;
}
