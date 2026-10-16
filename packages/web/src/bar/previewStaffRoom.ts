import {createFightState,advanceFight,DEFAULT_FIGHT_RULES,type FightState,type FightCommand} from '@hockey/game-core';
import {localDay} from './dailyGreeting.js';
// Standalone synthetic preview; never installed in the authenticated application.
export function installStaffRoomPreview(){
 const original=window.fetch.bind(window);
 const key=()=>`staff-room-demo:${localDay()}:${new URLSearchParams(location.search).get('staff-scenario')??'default'}`;
 const read=()=>JSON.parse(sessionStorage.getItem(key())??'{"warned":false,"outcome":null,"entries":{},"fight":false}') as {warned:boolean;outcome:string|null;entries:Record<string,number>;fight:boolean;warningId?:string};
 const save=(s:ReturnType<typeof read>)=>sessionStorage.setItem(key(),JSON.stringify(s));
 let fight:FightState|null=null,seq=1;
 window.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin);
  const state=read();
  if(url.pathname.endsWith('/bar/staff-room')){
   if(new URLSearchParams(location.search).get('office-preview')==='1')return Response.json({phase:'empty'});
   const body=JSON.parse(String(init?.body));
   if(state.outcome==='win')return Response.json({phase:'empty'});
   if(state.outcome==='loss')return Response.json({error:{code:'bar_closed',message:'На сегодня бар закрыт для тебя.'}},{status:403});
   if(body.action==='leave'){delete state.entries[body.entryId];save(state);return Response.json({phase:'scene'});}
   if(body.action==='warn'){
    if(!state.warned&&(!state.entries[body.entryId]||Date.now()-state.entries[body.entryId]!<3000))return Response.json({error:{code:'staff_room_not_ready',message:'Дождись трёх секунд.'}},{status:409});
    state.warned=true;state.warningId=body.entryId;save(state);return Response.json({phase:'warning'});
   }
   if(state.warned){state.fight=true;save(state);fight??=createFightState(DEFAULT_FIGHT_RULES,Date.now()+500);return Response.json({phase:'fight',fightId:'staff-room-demo-fight'});}
   state.entries[body.entryId]??=Date.now();save(state);return Response.json({phase:'scene',entryId:body.entryId});
  }
  if(url.pathname.endsWith('/bar/conversations/oleg')&&init?.method!=='POST'&&state.warned)return Response.json({greeting:'',revision:1,pending:false,turns:[{id:state.warningId,user:'',assistant:'Это кабинет директора. Без приглашения сюда не заходят. В следующий раз выведу тебя сам.',createdAt:new Date().toISOString(),speaker:'oleg',intervention:'staff-room',emotion:'displeasure'}]});
  if(url.pathname.includes('/bar/fights/staff-room-demo-fight')){
   if(url.pathname.endsWith('/acknowledge')){state.fight=false;save(state);return Response.json({blockedUntil:state.outcome==='loss'?new Date(Date.now()+3600000).toISOString():null,fightId:null});}
   fight??=createFightState(DEFAULT_FIGHT_RULES,Date.now()+500);
   const now=Date.now();let commands:FightCommand[]=[];
   if(init?.method==='POST'){
    const body=JSON.parse(String(init.body));
    commands=[{...body,player:0,effectiveAtMs:now,...(body.kind==='attack'?{zone:'head'}:{})} as FightCommand];seq=body.seq+1;
   }
   fight=advanceFight(fight,commands,now).state;
   const forced=new URLSearchParams(location.search).get('staff-outcome');
   if((forced==='win'||forced==='loss')&&now-fight.phaseStartedAtMs>1500)state.outcome=forced;
   else if(fight.status==='resolved')state.outcome=fight.winner===0?'win':'loss';
   save(state);return Response.json({id:'staff-room-demo-fight',state:fight,serverNow:now,outcome:state.outcome,nextSeq:seq});
  }
  return original(input,init);
 };
}
