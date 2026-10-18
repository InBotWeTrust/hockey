import {it,expect} from 'vitest';
import {normalizeBonusQualificationRules,validateBonusSkillRules,evaluateBonusQualification} from '../../src/bonusGames/qualification.js';
import {recordScore,compareRecordScores} from '../../src/bonusGames/records.js';
it('accepts single period Rhythm without inventory and evaluates credited points',()=>{
 const rules=normalizeBonusQualificationRules({type:'rhythm_in_time',targetPoints:20,minimumSeries:3,activeTimeMs:180000},{targetGoals:20,shotsLimit:0});
 expect(()=>validateBonusSkillRules('rhythm',rules,[{durationMs:180000,shotsLimit:null}],false)).not.toThrow();
 expect(evaluateBonusQualification(rules,{goals:30,shotsTaken:40,bestGoalStreak:4,activeElapsedMs:120000,totalPoints:19}).passed).toBe(false);
 expect(evaluateBonusQualification(rules,{goals:30,shotsTaken:40,bestGoalStreak:4,activeElapsedMs:120000,totalPoints:20}).passed).toBe(true);
});
it('orders Rhythm records by hundredths then series then exact accuracy then shots',()=>{
 const score=(ms:number,series:number,goals:number,shots:number)=>recordScore('rhythm',ms,shots,goals,series);
 expect(compareRecordScores(score(100001,7,20,40),score(100004,6,30,40))).toBe(-1);
 expect(compareRecordScores(score(100010,8,30,40),score(100004,6,20,40))).toBe(1);
 expect(compareRecordScores(score(100001,7,21,40),score(100004,7,20,40))).toBe(-1);
 expect(compareRecordScores(score(100001,7,20,40),score(100004,7,30,60))).toBe(-1);
 expect(compareRecordScores(score(100001,7,20,40),score(100004,7,20,40))).toBe(0);
});
