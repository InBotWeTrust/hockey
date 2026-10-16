import {apiFetch} from '../api/apiFetch.js';
export type StaffRoomState={phase:'scene'|'warning'|'fight'|'empty';fightId?:string;entryId?:string};
export const staffRoomEvent=(action:'enter'|'warn'|'leave',entryId:string)=>apiFetch<StaffRoomState>('/bar/staff-room',{method:'POST',body:JSON.stringify({action,entryId})});
