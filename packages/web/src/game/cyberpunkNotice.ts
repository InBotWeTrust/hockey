import {getBonusChallengeCondition,sampleCyberpunkEnvironment,cyberpunkEnvironmentForHistory,type BonusChallengeEnvironmentRules,type BonusChallengeShotPause,type CyberpunkPanelEvent} from '@hockey/game-core';
export function cyberpunkNotice(env:BonusChallengeEnvironmentRules,time:number,taps:readonly CyberpunkPanelEvent[],pauses:readonly BonusChallengeShotPause[]=[]):{notice:string;tone:'warning'|'error'|'success'|'slip'|'magnetic';scene:ReturnType<typeof sampleCyberpunkEnvironment>}{
 const scene=sampleCyberpunkEnvironment(env.cyberpunk!,time,taps);
 const condition=getBonusChallengeCondition(cyberpunkEnvironmentForHistory(env,pauses),time);
 let notice=env.baseModifiers?.label??'Неоновый разгон'; let tone:'warning'|'error'|'success'|'slip'|'magnetic'='warning';
 if(condition.status==='exhausted_stop'){notice='Передышка · бросок недоступен';tone='error';}
 else if(!condition.canShoot){notice='Игрок споткнулся';tone='slip';}
 else if(scene.activeStrip){notice='Магнитная полоса тормозит шайбу';tone='magnetic';}
 else if(scene.outage||scene.outageWarning) notice='Сбой питания · аварийный свет';
 else if(env.fatigue && condition.shooterSpeedMultiplier<1){notice=`${condition.fatigueLevel==='heavy'?'Сильная усталость':'Усталость'} · замедление ${Math.round((1-condition.shooterSpeedMultiplier)*100+1e-8)}%`;tone=condition.fatigueLevel==='heavy'?'error':'warning';}
 return {notice,tone,scene};
}
