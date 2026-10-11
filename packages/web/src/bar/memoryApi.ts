import {apiFetch} from '../api/apiFetch.js';
import type {BarCharacter} from './conversationApi.js';
export interface MemoryNote {id:string;kind:string;content:string;quote:string;sourceTurnId:string;version:number;provenance:string;updatedAt:string}
export interface MemoryView {enabled:boolean;revision:number;facts:MemoryNote[]}
export type MemoryChange={type:'enabled';enabled:boolean}|{type:'clear';revision:number}|{type:'delete';id:string;version:number}|{type:'edit';id:string;version:number;content:string};
export const fetchMemory=(character:BarCharacter)=>apiFetch<MemoryView>(`/bar/conversations/${character}/memory`);
export const changeMemory=(character:BarCharacter,change:MemoryChange)=>apiFetch<MemoryView>(`/bar/conversations/${character}/memory`,{method:'PATCH',body:JSON.stringify(change)});
