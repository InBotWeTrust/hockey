import {expect,it} from 'vitest';
import {resolveMarksmanshipShotContext,DEFAULT_MARKSMANSHIP_V3_SCORING_RULES} from './marksmanship.js';
import {resolvePerspectiveCourtShot} from './court/perspective.js';
import {STICK_NEUTRAL} from './shot/types.js';
it('classifies the real delayed crossing rather than the ordinary flight',()=>{
 const goalie={id:'yard',name:'yard',hp:1,baseReward:0,firstClearBonus:0,speed:1,pattern:'linear' as const,frequency:.9,goalFrequency:.72,amplitude:1,goalAmplitude:1};
 const phaseOffsets={goal:0,goalie:0,shooter:0};
 for(let t=0;t<5000;t+=20){
  const shotInput={tapTime:t,shooterFrequency:.82,puckSpeedPerMs:1.3};
  const crossings={goalieTimeMs:t+500,goalTimeMs:t+600};
  const expected=resolvePerspectiveCourtShot(shotInput,goalie,'yard',1,STICK_NEUTRAL,phaseOffsets,crossings);
  const ordinary=resolvePerspectiveCourtShot(shotInput,goalie,'yard',1,STICK_NEUTRAL,phaseOffsets);
  if(expected.type!==ordinary.type){
   const input={shotInput,goalie,seed:'yard',shotIndex:1,phaseOffsets,earliestTapTime:0,
    scoring:DEFAULT_MARKSMANSHIP_V3_SCORING_RULES,courtCrossings:()=>crossings};
   expect(resolveMarksmanshipShotContext(input).result.type).toBe(expected.type); return;
  }
 }
 throw new Error('fixture must distinguish the crossings');
});
it('scans a moving shooter clock when measuring a goal window',async()=>{
 const {classifyMarksmanshipShot}=await import('./marksmanship.js');
 const goalie={id:'yard',name:'yard',hp:1,baseReward:0,firstClearBonus:0,speed:1,pattern:'linear' as const,frequency:.9,goalFrequency:.72,amplitude:1,goalAmplitude:220};
 const phaseOffsets={goal:0,goalie:0,shooter:0};
 let checked=0;
 for(let t=100;t<2000;t+=40){
  const base={shotInput:{tapTime:t,shooterFrequency:.82,puckSpeedPerMs:1.3},goalie,seed:'yard',shotIndex:1,phaseOffsets,earliestTapTime:0,scoring:DEFAULT_MARKSMANSHIP_V3_SCORING_RULES};
  const reference=classifyMarksmanshipShot(base);if(reference.result.type!=='goal')continue;
  const sampled=classifyMarksmanshipShot({...base,shotInput:{...base.shotInput,shooterMotionTime:t},shooterMotionAt:(time:number)=>time});
  expect(sampled.windowDurationMs).toBe(reference.windowDurationMs);checked++;
 }
 expect(checked).toBeGreaterThan(0);
});
