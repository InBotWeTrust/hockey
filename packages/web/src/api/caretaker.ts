import {apiFetch} from './apiFetch.js';
export type CaretakerKind='push'|'trail'|'piles'|'turn'|'throw';
export type CaretakerInput={x:number;y:number;toX:number;toY:number;ms:number};
export interface CaretakerState{id:string;attemptId:string;kind:CaretakerKind;period:number;seq:number;progress:number;target:number;startedAt:string;serverNow:string;completed:boolean;readyAt:string}
export const startCaretaker=(requestId:string)=>apiFetch<CaretakerState>('/duel/daily/caretaker/start',{method:'POST',body:JSON.stringify({requestId})});
export const actCaretaker=(attemptId:string,seq:number,input:CaretakerInput)=>apiFetch<CaretakerState>('/duel/daily/caretaker/action',{method:'POST',body:JSON.stringify({attemptId,seq,input})});
export const caretakerHint=()=>apiFetch<{show:boolean}>('/duel/daily/caretaker/hint');
