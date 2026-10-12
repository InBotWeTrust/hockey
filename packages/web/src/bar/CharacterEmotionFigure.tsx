import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {emotionAsset,type CharacterEmotion} from './characterEmotion.js';
export function CharacterEmotionFigure({character,emotion,fallback,style,onFallbackError}:{
 character:string;emotion:CharacterEmotion;fallback:string;style:CSSProperties;onFallbackError:()=>void;
}) {
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
  image.src=desired;
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
 return <>
  {previous&&<img className="bar-emotion-base" src={previous} alt="" draggable={false} style={style}/>}
  <img key={current} data-current data-character-emotion={emotion} className={previous?'bar-emotion-current':undefined} src={current} alt="" draggable={false} style={style} onError={failed}/>
 </>;
}
