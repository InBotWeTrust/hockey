import {createHash} from 'node:crypto';
export type OfficeDayMode='scene'|'seated'|'empty';
const DAY=86400000;
const sample=(key:string)=>createHash('sha256').update(`elina-office-v1:${key}`).digest().readUInt32BE(0);
export function officeDayMode(user:string,day:string):OfficeDayMode {
 const at=Date.parse(`${day}T00:00:00Z`);
 if(!Number.isFinite(at)||new Date(at).toISOString().slice(0,10)!==day)throw Error('Invalid office day');
 const weekday=(new Date(at).getUTCDay()+6)%7;
 const monday=at-weekday*DAY;
 const raw=sample(`${user}:${monday}:scene`)%7;
 // Sunday is never moved. Only move Monday when the previous week selected Sunday.
 const special=raw===0&&sample(`${user}:${monday-7*DAY}:scene`)%7===6
  ? 1+sample(`${user}:${monday}:adjacent`)%6:raw;
 return weekday===special?'scene':sample(`${user}:${day}:presence`)%2===0?'seated':'empty';
}
