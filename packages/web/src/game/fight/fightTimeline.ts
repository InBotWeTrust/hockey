import { getFightPosture, type FightAction, type FightState, type FightZone } from '@hockey/game-core';
import type { FighterPose } from './Fighter.js';
export interface FightVisualFrame { pose:FighterPose; progress:number; motion:number; recovery?:number; reaction?:{kind:'hit'|'guard'|'strike'|'blocked';progress:number} }
interface Presentation {id:string;attacker:0|1;defender:0|1;zone:FightZone;blocked:boolean;showStrike:boolean;strikeAt:number;reactAt:number}
/** Presentation clock never owns damage. Event IDs survive repeats; initial history is not replayed. */
export class FightTimeline {
  private phase:number;
  private rules:FightState['rules'];
  private seen:Set<string>;
  private struck=new Set<string>();
  private presentations:Presentation[]=[];
  private prediction:FightAction|null=null;
  constructor(state:FightState){this.rules=state.rules;this.phase=state.phaseId;this.seen=new Set(state.responsive?.contacts.map(c=>c.id)??[]);}
  predict(id:string,player:0|1,at:number,zone:FightZone,crouch:boolean):void{
    this.prediction={actionId:id,player,phaseId:this.phase,seq:-1,effectiveAtMs:at,kind:'attack',zone,crouch,activeAtMs:at+this.rules.windupMs,activeUntilMs:at+this.rules.windupMs+this.rules.activeMs,busyUntilMs:at+this.rules.windupMs+this.rules.activeMs+this.rules.attackRecoveryMs,resolved:false};
  }
  clearPrediction():void{this.prediction=null;}
  observe(state:FightState,now:number):void{
    this.rules=state.rules;
    if(state.phaseId!==this.phase){
      this.phase=state.phaseId;this.prediction=null;this.presentations=[];this.struck.clear();
      // A coalesced snapshot can contain both the new phase and its first hit.
      // Ignore inherited contacts, but still present contacts of this phase's actions.
      const actions=new Set(state.actions.map(a=>a.actionId??`${a.phaseId}:${a.player}:${a.seq}`));
      this.seen=new Set((state.responsive?.contacts??[]).filter(c=>!actions.has(c.actionId)).map(c=>c.id));
    }
    this.presentations=this.presentations.filter(e=>now<e.reactAt+200);
    for(const c of state.responsive?.contacts??[]){
      if(this.seen.has(c.id))continue;this.seen.add(c.id);
      if(c.outcome==='miss')continue;
      const caughtUp=this.struck.has(c.actionId);
      this.presentations.push({id:c.id,attacker:c.attacker,defender:c.defender,zone:c.zone,blocked:c.outcome==='blocked',showStrike:!caughtUp,strikeAt:now,reactAt:now+(caughtUp||state.rules.version>=5?0:80)});
    }
  }
  frame(state:FightState,player:0|1,now:number):FightVisualFrame{
    const posture=getFightPosture(state,player,now);
    const current=[...state.actions].reverse().find(a=>a.player===player&&a.effectiveAtMs<=now&&now<a.busyUntilMs);
    const confirmedPrediction=this.prediction&&state.actions.find(a=>a.actionId===this.prediction!.actionId);
    const prediction= this.prediction?.player===player&&now<this.prediction.busyUntilMs&&!confirmedPrediction?.cancelledAtMs ? this.prediction:null;
    const action=prediction??(current?.actionId===this.prediction?.actionId?undefined:current);
    let pose:FighterPose=posture.crouch?(posture.guard?'crouch_block':'crouch'):(posture.guard?'block_head':'idle');
    let progress=0,motion=0,recovery=0;
    if(action&&action.outcome!=='cancelled'){
      const wind=now<action.activeAtMs;
      progress=Math.max(0,Math.min(1,(now-action.effectiveAtMs)/(action.busyUntilMs-action.effectiveAtMs)));
      pose=action.crouch?(wind?'crouch':'crouch_attack'):wind?'idle':`attack_${action.zone}`;
      recovery=now>=action.activeUntilMs?Math.min(1,(now-action.activeUntilMs)/(action.busyUntilMs-action.activeUntilMs)):0;
      if(wind)motion=-6*Math.sin(Math.PI/2*Math.max(0,(now-action.effectiveAtMs)/(action.activeAtMs-action.effectiveAtMs)));
      else {this.struck.add(action.actionId??`${action.phaseId}:${action.player}:${action.seq}`);motion=12*Math.sin(Math.PI*Math.max(0,Math.min(1,(now-action.activeAtMs)/(action.busyUntilMs-action.activeAtMs))));}
    }
    const event=[...this.presentations].reverse().find(e=>(e.attacker===player||e.defender===player)&&now<e.reactAt+200);
    if(event){
      if(event.attacker===player&&(state.rules.version<5||event.showStrike)&&now<(state.rules.version>=5?event.strikeAt+state.rules.activeMs:event.reactAt)){pose=event.zone==='body'?'crouch_attack':'attack_head';motion=12;}
      if(now>=event.reactAt){
        const reaction={kind:event.defender===player?(event.blocked?'guard':'hit'):(event.blocked?'blocked':'strike'),progress:(now-event.reactAt)/200} as NonNullable<FightVisualFrame['reaction']>;
        if(event.defender===player){pose=event.blocked?(posture.crouch?'crouch_block':'block_head'):'hit';}
        return {pose,progress,motion,recovery,reaction};
      }
    }
    if(now<posture.hitUntilMs)pose='hit';
    if(state.hp[player]===0&&state.status==='resolved'&&(!event||now>=event.reactAt+200))pose='lose';
    return {pose,progress,motion,recovery};
  }
}
