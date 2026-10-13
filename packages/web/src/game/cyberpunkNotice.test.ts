import {sampleCyberpunkEnvironment} from '@hockey/game-core';
import {expect,it} from 'vitest';
import {cyberpunkNotice} from './cyberpunkNotice';
const env={cyberpunk:{version:1 as const,seed:'yard',durationMs:150000},baseModifiers:{goalMultiplier:1.2,goalieMultiplier:1.4,shooterMultiplier:1.1,puckSpeedMultiplier:1.05,label:'Неоновый разгон'},fatigue:{slowdownStartMs:12000,heavyStartMs:24000,stopStartMs:36000,stopDurationMs:4000,recoveryDurationMs:6000,slowMultiplier:.85,heavyMultiplier:.65}};
it('shows true slowdown relative to ordinary bonus speed and red rest',()=>{
 const t=Array.from({length:120},(_,n)=>12000+n*100).find(t=>{const e=sampleCyberpunkEnvironment(env.cyberpunk,t,[]);return !e.activeStrip&&!e.outage&&!e.outageWarning;})!;
 expect(cyberpunkNotice(env,t,[]).notice).toContain('7%');
 expect(cyberpunkNotice(env,37000,[])).toMatchObject({notice:'Передышка · бросок недоступен',tone:'error'});
});
