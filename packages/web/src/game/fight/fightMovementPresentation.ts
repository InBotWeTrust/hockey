import {fightPositionsAt,getFightPosture,moveResponsivePositions,FIGHT_MOVE_SPEED,FIGHT_MIN_DISTANCE,neutralFightInput,type FightState,type FightHeldInput} from '@hockey/game-core';
/** Only the local sprite is predicted; authoritative positions still decide every contact. */
export class FightMovementPresentation {
 private position:number|null=null;
 private previous=0;
 private phase=-1;
 private desired=neutralFightInput();
 private pendingId:string|undefined;
 private inputAt=0;
 private lastHit=0;
 clear():void{this.position=null;this.phase=-1;this.pendingId=undefined;this.desired=neutralFightInput();}
 input(state:FightState,player:0|1,now:number,input:FightHeldInput,id?:string,predictedReady=0):void{
  this.positions(state,player,now,predictedReady);
  this.desired={...input};this.pendingId=id;this.inputAt=now;
 }
 positions(state:FightState,player:0|1,now:number,predictedReady:number):[number,number]{
  const authoritative=fightPositionsAt(state,now),posture=getFightPosture(state,player,now);
  if(this.position===null||this.phase!==state.phaseId){this.position=authoritative[player];this.previous=now;this.phase=state.phaseId;this.lastHit=posture.hitUntilMs;}
  if(state.status==='resolved'||state.status==='cancelled'){this.clear();return authoritative;}
  if(posture.hitUntilMs>this.lastHit){this.position=authoritative[player];this.lastHit=posture.hitUntilMs;}
  if(this.pendingId&&state.responsive?.commands.some(c=>c.actionId===this.pendingId))this.pendingId=undefined;
  // Never keep moving on a command that could not be confirmed after a long disconnect.
  if(this.pendingId&&now-this.inputAt>1000){this.pendingId=undefined;this.desired=neutralFightInput();}
  const dt=Math.max(0,Math.min(100,now-this.previous));
  const ready=Math.max(posture.readyAtMs,predictedReady,state.phaseStartedAtMs);
  const movingMs=this.desired.crouch?0:Math.max(0,Math.min(dt,now-ready));
  const positions:[number,number]=[...authoritative];positions[player]=player===0?Math.min(this.position,positions[1]-FIGHT_MIN_DISTANCE):Math.max(this.position,positions[0]+FIGHT_MIN_DISTANCE);
  moveResponsivePositions(positions,player===0?[this.desired.direction*FIGHT_MOVE_SPEED*(this.desired.guard?.5:1),0]:[0,-this.desired.direction*FIGHT_MOVE_SPEED*(this.desired.guard?.5:1)],movingMs);
  this.position=positions[player];
  if(!this.pendingId){this.position+=(authoritative[player]-this.position)*(1-Math.exp(-dt/70));positions[player]=this.position;}
  this.previous=now;return positions;
 }
}
