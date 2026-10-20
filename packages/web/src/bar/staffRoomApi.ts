import {apiFetch} from '../api/apiFetch.js';
export type StaffRoomState={phase:'scene'|'seated'|'warning'|'fight'|'empty'|'escorted';conversationRevision?:number;fightId?:string;entryId?:string;warnAfterMs?:number;day?:string};
export const staffRoomEvent=(action:'enter'|'warn'|'leave',entryId:string)=>apiFetch<StaffRoomState>('/bar/staff-room',{method:'POST',body:JSON.stringify({action,entryId})});
