import {useEffect,useRef,useState,useId,type CSSProperties} from 'react';
import {emotionAsset,type CharacterExpression} from './characterEmotion.js';
export function CharacterEmotionFigure({character,emotion,fallback,style,onFallbackError}:{
 character:string;emotion:CharacterExpression;fallback:string;style:CSSProperties;onFallbackError:()=>void;
}) {
 const maskId=useId().replace(/:/g,'');
 const faces:Record<string,[number,number,number,number]>={maria:[535,280,78,80],daria:[450,280,80,85],grigory:[480,280,85,90],arsenich:[425,285,82,84],veronika:[410,210,85,90],oleg:[530,165,80,90],igor:[520,160,80,88]};
 const neutral=emotionAsset(character,'neutral')??fallback;
 const desired=emotionAsset(character,emotion)??fallback;
 const [current,setCurrent]=useState(neutral),[previous,setPrevious]=useState<string|null>(null);
 const currentRef=useRef(current);currentRef.current=current;
 useEffect(()=>{
  if(previous || desired===currentRef.current)return;
  let cancelled=false;
  const image=new Image();
  image.onload=()=>{if(!cancelled){setPrevious(currentRef.current);setCurrent(desired);}};
  image.onerror=()=>{if(!cancelled){setPrevious(null);setCurrent(neutral);}};
  image.src=desired.endsWith('/greeting-v1.webp')?emotionAsset(character,'joy')!:desired;
  return()=>{cancelled=true;image.onload=null;image.onerror=null;};
 },[desired,neutral,previous]);
 useEffect(()=>{
  if(!previous)return;
  const timer=setTimeout(()=>setPrevious(null),720);
  return()=>clearTimeout(timer);
 },[previous,current]);
 const failed=()=>{
  setPrevious(null);
  if(current!==neutral)setCurrent(neutral);
  else if(current!==fallback)setCurrent(fallback);
  else onFallbackError();
 };
 const frame=(source:string,isCurrent:boolean)=>{
  const className=isCurrent?(previous?'bar-emotion-current':undefined):'bar-emotion-base';
  const attributes=isCurrent?{'data-current':true,'data-character-emotion':emotion}:{};
  if(source.endsWith('/greeting-v1.webp')&&faces[character]){
   const [cx,cy,rx,ry]=faces[character];
   return <svg key={source} {...attributes} data-frame={source} className={className} style={{...style,position:'absolute'}} viewBox="0 0 1024 1536" aria-hidden="true">
    <defs>
     <radialGradient id={`${maskId}-fade`}><stop offset="75%" stopColor="white"/><stop offset="100%" stopColor="black"/></radialGradient>
     <mask id={`${maskId}-${isCurrent?'current':'previous'}`} maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1536"><ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${maskId}-fade)`}/></mask>
    </defs>
    <image href={neutral} width="1024" height="1536" onError={failed}/>
    <image href={emotionAsset(character,'joy')!} width="1024" height="1536" mask={`url(#${maskId}-${isCurrent?'current':'previous'})`} onError={failed}/>
   </svg>;
  }
  return <img key={source} {...attributes} className={className} src={source} alt="" draggable={false} style={style} onError={failed}/>;
 };
 return <>{previous&&frame(previous,false)}{frame(current,true)}</>;
}
