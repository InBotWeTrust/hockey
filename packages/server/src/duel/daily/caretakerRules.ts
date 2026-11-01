import {caretakerBreakReadyAt} from '@hockey/game-core';
export const caretakerKinds = ['push','trail','piles','turn','throw'] as const;
export type CaretakerKind = typeof caretakerKinds[number];
export type CaretakerInput = {x:number;y:number;toX:number;toY:number;ms:number};
export type CaretakerProgress = {value:number;cycle:number};
export const initialProgress = ():CaretakerProgress => ({value:0,cycle:-1});
export const caretakerTargets:Record<CaretakerKind,number> = {push:20,trail:60,piles:24000,turn:5,throw:5};
export function acceleratedReadyAt(_periodEnd:number,original:number,completed:number){return caretakerBreakReadyAt(original,completed);}
export function applyCaretakerInput(kind:CaretakerKind,p:CaretakerProgress,input:CaretakerInput,elapsed:number,delta:number):CaretakerProgress{
 const next={...p};
 if(Object.values(input).some(n=>!Number.isFinite(n))||delta<0)return next;
 if(kind==='push'&&delta>=1000){const direction=Math.floor(p.value/4)%2===0?-1:1;if((input.toY-input.y)*direction>=.08&&Math.abs(input.toX-input.x)<.15)next.value++;}
 if(kind==='piles'){
  const index=Math.min(5,Math.floor(p.value/4000));const x=index%2===0?.25:.75,y=.25+Math.floor(index/2)*.25;
  if(Math.hypot(input.x-x,input.y-y)<.12)next.value=Math.min((index+1)*4000,p.value+Math.max(0,Math.min(input.ms,delta,500)));
 }
 if(kind==='trail'){
  const lane=Math.floor(p.value/20),step=p.value%20,x=.25+lane*.25,y=.1+step*.04;
  if(delta>=350&&Math.abs(input.x-x)<.09&&Math.abs(input.toX-x)<.09&&Math.abs(input.y-y)<.06&&Math.abs(input.toY-(y+.04))<.025)next.value++;
 }
 if(kind==='turn'){
  const cycle=Math.floor(elapsed/5000),phase=elapsed%5000;
  if(phase>=4100&&cycle>p.cycle){next.value++;next.cycle=cycle;}
 }
 if(kind==='throw'&&delta>=4000){const dx=input.toX-input.x,dy=input.toY-input.y,direction=p.value%2===0?1:-1;if(dx*direction>=.12&&dx*direction<=.45&&Math.abs(dy)<=Math.abs(dx)*.577)next.value++;}
 next.value=Math.min(caretakerTargets[kind],next.value);return next;
}
