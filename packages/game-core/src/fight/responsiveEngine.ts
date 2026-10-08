import type { FightAction, FightActionCommand, FightCommand, FightEvent, FightFrame, FightPlayer, FightState, FightTransition } from './types.js';
import { cloneFightFrame, FIGHT_INPUT_LEASE_MS, FIGHT_RESPONSIVE_HIT_MS, FIGHT_GUARD_BREAK_MS, neutralFightInput } from './responsiveInput.js';
import { classifyFightContact, fightActionId } from './responsiveContacts.js';

const players = [0,1] as const;
/** Replay only this short phase's admitted history. Receipt order cannot change historical contact. */
export function advanceResponsiveFight(input: FightState, commands: readonly FightCommand[], sealedMs:number): FightTransition {
  if (input.status==='resolved'||input.status==='cancelled'||!Number.isSafeInteger(sealedMs)||sealedMs<input.finalizedThroughMs) return {state:input,events:[]};
  const events:FightEvent[]=[];
  const lastSeq:[number,number]=[...input.lastSeq];
  const history=[...(input.responsive?.commands??[])];
  for (const c of [...commands].sort((a,b)=>a.seq-b.seq)) {
    let reason:'phase'|'duplicate'|'time'|undefined;
    if(c.phaseId!==input.phaseId) reason='phase';
    else if(c.seq<=lastSeq[c.player]) reason='duplicate';
    else { lastSeq[c.player]=c.seq; if(!Number.isSafeInteger(c.effectiveAtMs)||c.effectiveAtMs<input.phaseStartedAtMs||c.effectiveAtMs>=input.deadlineMs||c.effectiveAtMs<=input.finalizedThroughMs||c.kind==='block'||c.kind==='move') reason='time'; }
    if(reason) events.push({type:'rejected',player:c.player,seq:c.seq,reason}); else history.push(c);
  }
  history.sort((a,b)=>a.effectiveAtMs-b.effectiveAtMs||a.player-b.player||a.seq-b.seq);
  const state:FightState={...input,rules:{...input.rules},hp:[...(input.responsive?.initialHp??input.hp)],lastSeq,actions:[],moves:[],responsive:{commands:history,initialHp:[...(input.responsive?.initialHp??input.hp)],timeline:[],contacts:[]}};
  const runtime:FightFrame={atMs:input.phaseStartedAtMs,positions:[.32,.68],players:players.map(()=>({...neutralFightInput(),guardUnits:3,readyAtMs:input.phaseStartedAtMs,hitUntilMs:0,guardBreakUntilMs:0})) as FightFrame['players'],leaseUntil:[0,0],releasedAt:[input.phaseStartedAtMs,input.phaseStartedAtMs],regenerated:[0,0]};
  const held=players.map(()=>neutralFightInput());
  const buffered:[FightActionCommand|null,FightActionCommand|null]=[null,null];
  const end=Math.min(input.deadlineMs,Math.max(sealedMs,...history.map(c=>c.effectiveAtMs),input.phaseStartedAtMs));
  const times=new Set<number>([input.phaseStartedAtMs,end]);
  history.forEach(c=>{times.add(c.effectiveAtMs); if(c.kind==='input') times.add(c.effectiveAtMs+FIGHT_INPUT_LEASE_MS);});
  const incoming=new Set(commands.map(c=>`${c.player}:${c.seq}`));
  const rejectBusy=(c:FightCommand)=>{if(incoming.has(`${c.player}:${c.seq}`))events.push({type:'rejected',player:c.player,seq:c.seq,reason:'busy'});};
  const startAttack=(c:FightActionCommand,t:number)=>{
    const p=runtime.players[c.player];
    const a:FightAction={...c,effectiveAtMs:t,zone:p.crouch?'body':'head',crouch:p.crouch,actionId:fightActionId(c),activeAtMs:t+state.rules.windupMs,activeUntilMs:t+state.rules.windupMs+state.rules.activeMs,busyUntilMs:t+state.rules.windupMs+state.rules.activeMs+state.rules.attackRecoveryMs,resolved:false};
    state.actions.push(a);p.guard=false;p.direction=0;p.readyAtMs=a.busyUntilMs;
    if(runtime.releasedAt[c.player]===null){runtime.releasedAt[c.player]=t;runtime.regenerated[c.player]=0;}
    times.add(a.activeAtMs);times.add(a.busyUntilMs);
  };
  let previous=runtime.atMs;
  while(times.size){
    const t=Math.min(...times);times.delete(t);if(t>end)continue;
    // Integrate motion using velocities fixed over this event segment and collision constraints.
    let remaining=t-previous;
    for(let n=0;remaining>1e-7&&n<6;n++){
      const v=players.map(i=>{
        const p=runtime.players[i];if(p.crouch||previous<p.readyAtMs)return 0;
        let speed=p.direction*(i===0?1:-1)*.0003*(p.guard?.5:1);
        if((runtime.positions[i]<=.25+1e-9&&speed<0)||(runtime.positions[i]>=.75-1e-9&&speed>0))speed=0;return speed;
      });
      if(runtime.positions[1]-runtime.positions[0]<=.34+1e-9&&v[0]!>v[1]!){const shared=v[0]!>0&&v[1]!>0?Math.min(v[0]!,v[1]!):v[0]!<0&&v[1]!<0?Math.max(v[0]!,v[1]!):0;v[0]=shared;v[1]=shared;}
      let dt=remaining;players.forEach(i=>{if(v[i]!<0)dt=Math.min(dt,(.25-runtime.positions[i])/v[i]!);if(v[i]!>0)dt=Math.min(dt,(.75-runtime.positions[i])/v[i]!);});
      if(v[0]!>v[1]!)dt=Math.min(dt,Math.max(0,(runtime.positions[1]-runtime.positions[0]-.34)/(v[0]!-v[1]!)));
      players.forEach(i=>runtime.positions[i]+=v[i]!*dt);remaining-=dt;
    }
    previous=t;runtime.atMs=t;
    for(const i of players){
      const p=runtime.players[i];
      if(t>=runtime.leaseUntil[i])held[i]=neutralFightInput();
      if(t>=p.readyAtMs){Object.assign(p,held[i]); if(t<p.guardBreakUntilMs||t<p.hitUntilMs||p.guardUnits===0)p.guard=false;}
      if(p.guard){runtime.releasedAt[i]=null;runtime.regenerated[i]=0;}
      else if(runtime.releasedAt[i]===null){runtime.releasedAt[i]=t;runtime.regenerated[i]=0;}
      const release=runtime.releasedAt[i];
      if(release!==null){const count=Math.max(0,Math.floor((t-release-600)/500));p.guardUnits=Math.min(3,p.guardUnits+count-runtime.regenerated[i]);runtime.regenerated[i]=count;}
    }
    for(const c of history.filter(c=>c.effectiveAtMs===t)){
      const p=runtime.players[c.player];
      if(c.kind==='input'){
        held[c.player]={...c.input};runtime.leaseUntil[c.player]=t+FIGHT_INPUT_LEASE_MS;
        if(t>=p.readyAtMs){Object.assign(p,c.input);if(t<p.hitUntilMs||t<p.guardBreakUntilMs)p.guard=false;}
      }else if(c.kind==='attack'){
        if(t>=p.readyAtMs)startAttack(c,t);
        else if(p.readyAtMs-t<=150)buffered[c.player]=c;
        else rejectBusy(c);
      }
    }
    for(const i of players){const c=buffered[i];if(c&&t>=runtime.players[i].readyAtMs){buffered[i]=null;startAttack(c,t);}}
    const group=state.actions.filter(a=>!a.resolved&&a.activeAtMs===t&&t<=sealedMs&&t<state.deadlineMs);
    const damage:[number,number]=[0,0];
    for(const a of group){
      const defender=(1-a.player) as FightPlayer;const p=runtime.players[defender];
      const outcome=classifyFightContact(a,p,runtime.positions[1]-runtime.positions[0]<=.4+1e-9);
      a.resolved=true;a.outcome=outcome;
      state.responsive!.contacts.push({id:`${fightActionId(a)}:contact`,actionId:fightActionId(a),atMs:t,attacker:a.player,defender,zone:a.zone,outcome,guardBroken:outcome==='blocked'&&p.guardUnits===1});
      if(outcome==='hit')damage[defender]++;
    }
    for(const contact of state.responsive!.contacts.filter(c=>c.atMs===t&&c.outcome==='blocked')){
      const p=runtime.players[contact.defender];p.guardUnits=Math.max(0,p.guardUnits-1);
      if(p.guardUnits===0){p.guard=false;p.guardBreakUntilMs=t+FIGHT_GUARD_BREAK_MS;p.readyAtMs=Math.max(p.readyAtMs,p.guardBreakUntilMs);times.add(p.readyAtMs);}
    }
    for(const i of players)if(damage[i]){
      runtime.players[i].hitUntilMs=t+FIGHT_RESPONSIVE_HIT_MS;
      runtime.players[i].readyAtMs=t+FIGHT_RESPONSIVE_HIT_MS;runtime.players[i].guard=false;runtime.players[i].direction=0;
      buffered[i]=null;times.add(t+FIGHT_RESPONSIVE_HIT_MS);
      for(const a of state.actions)if(a.player===i&&!a.resolved&&a.activeAtMs>t){a.resolved=true;a.outcome='cancelled';a.cancelledAtMs=t;a.busyUntilMs=t;}
    }
    state.hp=players.map(i=>Math.max(0,state.hp[i]-damage[i])) as [number,number];
    // Record guard release after transitions, including attack opening a held guard.
    for(const i of players){if(runtime.players[i].guard){runtime.releasedAt[i]=null;runtime.regenerated[i]=0;}else if(runtime.releasedAt[i]===null){runtime.releasedAt[i]=t;runtime.regenerated[i]=0;}}
    state.responsive!.timeline.push(cloneFightFrame(runtime));
    if(state.hp[0]===0||state.hp[1]===0){
      if(state.hp[0]===0&&state.hp[1]===0){if(state.status==='sudden_death')state.hp=[1,1];else{enterSuddenDeath(state,t);break;}}
      else{state.status='resolved';state.winner=state.hp[0]===0?1:0;state.endedAtMs=t;break;}
    }
  }
  if(state.status!=='resolved'&&state.phaseId===input.phaseId&&sealedMs>=state.deadlineMs){
    if(state.hp[0]!==state.hp[1]){state.status='resolved';state.winner=state.hp[0]>state.hp[1]?0:1;state.endedAtMs=state.deadlineMs;}
    else if(state.status==='sudden_death'){state.status='cancelled';state.endedAtMs=state.deadlineMs;}
    else enterSuddenDeath(state,state.deadlineMs);
  }
  const oldIds=new Set(input.responsive?.contacts.map(c=>c.id)??[]);
  for(const c of state.responsive!.contacts)if(c.outcome==='hit'&&!oldIds.has(c.id)){const d:[number,number]=[0,0];d[c.defender]=1;events.push({type:'damage',atMs:c.atMs,damage:d});}
  if(state.phaseId!==input.phaseId)events.push({type:'phase',phaseId:state.phaseId,startsAtMs:state.phaseStartedAtMs});
  if(state.status==='resolved'||state.status==='cancelled')events.push({type:'result',winner:state.winner,atMs:state.endedAtMs!});
  state.finalizedThroughMs=sealedMs;
  return {state,events};
}
function enterSuddenDeath(state:FightState,atMs:number):void{
  state.status='sudden_death';state.hp=[1,1];state.phaseId++;state.phaseStartedAtMs=atMs+state.rules.deliveryGraceMs;state.deadlineMs=state.phaseStartedAtMs+state.rules.suddenDeathDurationMs;state.actions=[];
  state.responsive={commands:[],initialHp:[1,1],contacts:state.responsive!.contacts,timeline:[]};
}
