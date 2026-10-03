import {createCyberpunkSchedule,traceCyberpunkFlight,type CyberpunkRules,type CyberpunkPanelEvent} from './cyberpunkEnvironment.js';
import {simulateShooter} from './shooter/simulate.js';
import {PUCK_START,GOAL_OPENING} from './rink.js';
import {GOALIE_Y,type GoalieConfig} from './goalie/types.js';
import {PUCK_SPEED_PER_MS,STICK_NEUTRAL,type ShotInput} from './shot/types.js';
import type {SessionPhaseOffsets} from './session.js';
import {resolvePerspectiveCourtShot} from './court/perspective.js';
export function cyberpunkShotFlight(input:ShotInput,rules:CyberpunkRules,taps:readonly CyberpunkPanelEvent[],offsets?:SessionPhaseOffsets,endY:number=GOAL_OPENING.y){
 const x=simulateShooter((input.shooterMotionTime??input.shooterTapTime??input.tapTime)+(offsets?.shooter??0),input.shooterFrequency).x;
 return traceCyberpunkFlight({x,startY:PUCK_START.y,endY,speedPerMs:input.puckSpeedPerMs??PUCK_SPEED_PER_MS,
  tapTime:input.tapTime,events:createCyberpunkSchedule(rules),panelEvents:taps});
}
export function cyberpunkCrossings(input:ShotInput,rules:CyberpunkRules,taps:readonly CyberpunkPanelEvent[],offsets?:SessionPhaseOffsets){
 const flight=cyberpunkShotFlight(input,rules,taps,offsets);
 return {goalieTimeMs:input.tapTime+flight.arrivalMsAtY(GOALIE_Y)!,goalTimeMs:input.tapTime+flight.durationMs};
}
export function resolveCyberpunkCourtShot(input:ShotInput,goalie:GoalieConfig,seed:string,shotIndex:number,rules:CyberpunkRules,taps:readonly CyberpunkPanelEvent[],offsets?:SessionPhaseOffsets){
 const result=resolvePerspectiveCourtShot(input,goalie,seed,shotIndex,STICK_NEUTRAL,offsets,cyberpunkCrossings(input,rules,taps,offsets));
 return {result,blockedByWater:false,flight:cyberpunkShotFlight(input,rules,taps,offsets,result.type==='save'?GOALIE_Y:GOAL_OPENING.y)};
}
