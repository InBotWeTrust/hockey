import {useRef, type HTMLAttributes, type RefObject} from 'react';

/** Native touch/trackpad scrolling; mouse dragging never becomes a click. */
export function useHorizontalPan(ref:RefObject<HTMLElement>, onMove?:()=>void):HTMLAttributes<HTMLElement> {
 const drag=useRef<{x:number;y:number;left:number;mouse:boolean;moved:boolean}|null>(null);
 const blocked=useRef(false);
 return {
  onPointerDownCapture:e=>{
   if(e.button!==0||e.isPrimary===false)return;
   blocked.current=false;
   const el=ref.current;if(!el)return;
   el.scrollTo?.({left:el.scrollLeft,behavior:'instant' as ScrollBehavior});
   drag.current={x:e.clientX,y:e.clientY,left:el.scrollLeft,mouse:e.pointerType==='mouse',moved:false};
  },
  onPointerMoveCapture:e=>{
   const d=drag.current,el=ref.current;if(!d||!el)return;
   if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>8){d.moved=true;blocked.current=true;onMove?.();}
   if(d.moved&&d.mouse){el.setPointerCapture?.(e.pointerId);el.scrollLeft=d.left+d.x-e.clientX;}
  },
  onPointerUpCapture:e=>{
   const d=drag.current;
   if(d&&(d.moved||Math.hypot(e.clientX-d.x,e.clientY-d.y)>8)){blocked.current=true;onMove?.();}
   drag.current=null;
  },
  onPointerCancelCapture:()=>{blocked.current=true;drag.current=null;onMove?.();},
  onScroll:()=>{onMove?.();},
  onClickCapture:e=>{if(blocked.current&&e.detail!==0){e.preventDefault();e.stopPropagation();}},
 };
}
