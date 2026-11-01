import {expect,it,vi} from 'vitest';
import {createDrift,stepDrift} from '@hockey/game-core';
import {animateMachineImpact} from './machineImpact.js';
const input={x:1,y:0,held:true};
const options={venue:'stadium',variant:'drift',reducedMotion:false} as const;
it('shakes the rink on a strong crash and on the second gentle impact, not a normal bounce',()=>{
 const surface=document.createElement('div');
 const animation={cancel:vi.fn()};
 const animate=vi.fn().mockReturnValue(animation);surface.animate=animate;
 const previous={...createDrift('impact'),x:545,y:400,angle:0,vx:330,vy:0};
 const hard=stepDrift(previous,input);
 expect(animateMachineImpact(surface,previous,hard,options)).toBe(animation);
 expect(animate).toHaveBeenCalledOnce();
 animate.mockClear();
 const gentleBefore={...previous,vx:130};
 const gentle=stepDrift(gentleBefore,input);
 expect(animateMachineImpact(surface,gentleBefore,gentle,options)).toBeNull();
 expect(animate).not.toHaveBeenCalled();
 const repeatedBefore={...gentle,x:545,vx:130,reboundTicks:0};
 const repeated=stepDrift(repeatedBefore,input);
 animateMachineImpact(surface,repeatedBefore,repeated,options);
 expect(animate).toHaveBeenCalledOnce();
 animateMachineImpact(surface,repeated,{...repeated,fallTicks:59},options);
 expect(animate).toHaveBeenCalledOnce();
});
it('respects reduced motion and limits shaking to the stadium drift game',()=>{
 const surface=document.createElement('div');surface.animate=vi.fn();
 const previous=createDrift('scope'),next={...previous,fallTicks:60};
 for(const override of [{reducedMotion:true},{venue:'yard' as const},{variant:'blizzard' as const}]){
  expect(animateMachineImpact(surface,previous,next,{...options,...override})).toBeNull();
 }
 expect(surface.animate).not.toHaveBeenCalled();
});
