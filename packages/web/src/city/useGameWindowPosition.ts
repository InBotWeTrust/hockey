import {useLayoutEffect,useRef,useState,type CSSProperties,type PointerEvent as ReactPointerEvent,type KeyboardEvent} from 'react';
type Point={x:number;y:number};
function read(key:string):Point|null {
 try {const p=JSON.parse(localStorage.getItem(key)??'null');return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)?p:null;}catch{return null;}
}
export function useGameWindowPosition(owner:string|undefined,open:boolean){
 const key=`floating-games-window-v1:${owner??'anonymous'}`;
 const [point,setPoint]=useState<Point|null>(()=>read(key));
 const handle=useRef<HTMLButtonElement>(null);
 const current=useRef(point);current.current=point;
 const drag=useRef<{id:number;x:number;y:number;start:Point}|null>(null);
 const clamp=(p:Point):Point=>{
  const card=handle.current?.closest<HTMLElement>('[role="dialog"]');
  const rect=card?.getBoundingClientRect();
  const backdrop=card?.parentElement;
  const style=backdrop?getComputedStyle(backdrop):null;
  const width=window.innerWidth,height=window.innerHeight;
  const top=parseFloat(style?.paddingTop??'')||12,bottom=parseFloat(style?.paddingBottom??'')||12;
  return {x:Math.max(12,Math.min(p.x,width-(rect?.width||Math.min(320,width-32))-12)),y:Math.max(top,Math.min(p.y,height-(rect?.height||260)-bottom))};
 };
 const update=(p:Point,persist=false)=>{
  const next=clamp(p);current.current=next;setPoint(next);
  if(persist)try{localStorage.setItem(key,JSON.stringify(next));}catch{/* Position persistence is optional. */}
 };
 useLayoutEffect(()=>{
  const saved=read(key);current.current=saved;setPoint(saved);
  drag.current=null;
  if(!open)return;
  const resize=()=>{if(current.current)update(current.current);};
  resize();
  const card=handle.current?.closest('[role="dialog"]');
  const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(resize);
  if(card)observer?.observe(card);
  window.addEventListener('resize',resize);
  return()=>{observer?.disconnect();window.removeEventListener('resize',resize);};
 },[key,open]);
 const finish=(event:ReactPointerEvent<HTMLButtonElement>)=>{
  const d=drag.current;if(!d||event.pointerId!==d.id)return;
  update({x:d.start.x+event.clientX-d.x,y:d.start.y+event.clientY-d.y},true);drag.current=null;
  if(event.currentTarget.hasPointerCapture?.(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
 };
 const handleProps={
  ref:handle,
  onPointerDown:(event:ReactPointerEvent<HTMLButtonElement>)=>{
   if(event.button!==0||event.isPrimary===false||drag.current)return;
   const rect=event.currentTarget.closest('[role="dialog"]')!.getBoundingClientRect();
   drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,start:{x:rect.left,y:rect.top}};
   event.currentTarget.setPointerCapture?.(event.pointerId);event.preventDefault();
  },
  onPointerMove:(event:ReactPointerEvent<HTMLButtonElement>)=>{
   const d=drag.current;if(!d||d.id!==event.pointerId)return;event.preventDefault();
   update({x:d.start.x+event.clientX-d.x,y:d.start.y+event.clientY-d.y});
  },
  onPointerUp:finish,
  onPointerCancel:()=>{drag.current=null;if(current.current)update(current.current,true);},
  onLostPointerCapture:()=>{drag.current=null;},
  onKeyDown:(event:KeyboardEvent<HTMLButtonElement>)=>{
   const delta:{[key:string]:Point}={ArrowLeft:{x:-10,y:0},ArrowRight:{x:10,y:0},ArrowUp:{x:0,y:-10},ArrowDown:{x:0,y:10}};
   const d=delta[event.key];if(!d)return;event.preventDefault();
   const rect=event.currentTarget.closest('[role="dialog"]')!.getBoundingClientRect();
   const start=current.current??{x:rect.left,y:rect.top};update({x:start.x+d.x,y:start.y+d.y},true);
  },
 };
 const cardStyle:CSSProperties=point?{position:'absolute',left:point.x,top:point.y,margin:0}:{};
 return {handleProps,cardStyle};
}
