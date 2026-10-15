import type {BarCharacter} from './conversationApi.js';

const unavailableStorage = new Map<string,string>();
export function localDay(date=new Date()):string {
 return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function nextLocalMidnight(date=new Date()):number {
 return new Date(date.getFullYear(),date.getMonth(),date.getDate()+1).getTime();
}
const keyFor=(account:string,character:BarCharacter)=>`bar-greeting-v1:${encodeURIComponent(account)}:${character}`;
export function hasDailyGreeting(account:string,character:BarCharacter):boolean {
 const key=keyFor(account,character);
 if(unavailableStorage.get(key)===localDay())return true;
 try{return localStorage.getItem(key)===localDay();}
 catch{return unavailableStorage.get(key)===localDay();}
}
export function claimDailyGreeting(account:string,character:BarCharacter):boolean {
 if(hasDailyGreeting(account,character))return false;
 const key=keyFor(account,character),day=localDay();
 try{localStorage.setItem(key,day);}catch{unavailableStorage.set(key,day);}
 return true;
}
