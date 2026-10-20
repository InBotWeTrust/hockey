export type Interest='none'|'business'|'personal';
export interface Meeting {
 remaining:number; lastMessageAt:number; personalAllowed:boolean; successful:boolean;
 action:'continue'|'warning'|'leave';
}
export interface Presence {mode:'scene'|'seated'|'empty';until:number;absentUntil:number}
export function beginMeeting(previous:Meeting|null,now:number,amateur:boolean,successes:number):Meeting {
 if(previous&&now-previous.lastMessageAt<1800000&&previous.action!=='leave')return previous;
 return {remaining:amateur?5:2,lastMessageAt:now,personalAllowed:successes>=2,successful:false,action:'continue'};
}
export function advanceMeeting(meeting:Meeting,now:number,interest:Interest):Meeting {
 const interested=interest==='business'||interest==='personal'&&meeting.personalAllowed;
 const remaining=meeting.remaining-1+(interested?5:0);
 return {...meeting,remaining,lastMessageAt:now,successful:meeting.successful||interest==='business',
  action:remaining<=0?'leave':remaining===1?'warning':'continue'};
}
export function resolvePresence(previous:Presence|null,now:number,special:boolean,random:number):Presence {
 if(special)return {mode:'scene',until:previous?.until??now+1800000,absentUntil:previous?.absentUntil??0};
 if(previous&&previous.absentUntil>now)return {...previous,mode:'empty'};
 if(previous&&previous.until>now)return previous;
 return {mode:random<.4?'seated':'empty',until:now+1800000,absentUntil:0};
}
