import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ReactionBar } from '../chat/components/ReactionBar.js';
import { ReactionPicker } from '../chat/components/ReactionPicker.js';
import { useSocial } from './SocialContext.js';
import type { ActivityEvent } from './api.js';

export function ActivityReactions({event,children,label,onOpen}:{event:ActivityEvent;children:ReactNode;label:string;onOpen:()=>void}):JSX.Element {
 const {api,viewerId}=useSocial();const client=useQueryClient();
 const [anchor,setAnchor]=useState<DOMRect|null>(null);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const held=useRef(false);const origin=useRef({x:0,y:0});
 const cancel=()=>{if(timer.current!==null){clearTimeout(timer.current);timer.current=null;}};
 useEffect(()=>()=>cancel(),[]);
 const mutation=useMutation({mutationFn:(emoji:string)=>api.react(event.id,emoji,Boolean(event.reactions?.find(r=>r.emoji===emoji)?.reactedByMe)),onSuccess:async()=>{
  await client.invalidateQueries({queryKey:['social',viewerId,'visible-reactions']});
 }});
 const choose=(emoji:string)=>{if(mutation.isPending)return;setAnchor(null);mutation.mutate(emoji);};
 return <>
  <button className="social-feed-result" aria-label={label}
   onPointerDown={e=>{cancel();held.current=false;if(e.button!==0)return;origin.current={x:e.clientX,y:e.clientY};const rect=e.currentTarget.getBoundingClientRect();timer.current=setTimeout(()=>{held.current=true;setAnchor(rect);},500);}}
   onPointerMove={e=>{if(Math.hypot(e.clientX-origin.current.x,e.clientY-origin.current.y)>10)cancel();}}
   onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel}
   onContextMenu={e=>{e.preventDefault();cancel();held.current=true;setAnchor(e.currentTarget.getBoundingClientRect());}}
   onClick={e=>{if(held.current){e.preventDefault();held.current=false;return;}onOpen();}}
   onKeyDown={e=>{if((e.shiftKey&&e.key==='F10')||e.key==='ContextMenu'){e.preventDefault();setAnchor(e.currentTarget.getBoundingClientRect());}}}
  >{children}</button>
  {Boolean(event.reactions?.length)&&<div className="social-feed-reactions" aria-busy={mutation.isPending}>
   <ReactionBar reactions={event.reactions??[]} onToggle={choose}/>
  </div>}
  {mutation.isError&&<span role="alert" className="modal-copy">Не удалось изменить реакцию. Попробуйте ещё раз.</span>}
  <ReactionPicker open={Boolean(anchor)} anchorRect={anchor} onPick={choose} onClose={()=>setAnchor(null)}/>
 </>;
}
