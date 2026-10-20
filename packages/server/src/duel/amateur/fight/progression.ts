import type { FightState } from '@hockey/game-core';
export function fightNeedsAdvance(state:FightState,through:number):boolean{
 if(through>=state.deadlineMs)return true;
 if(state.rules.version>=3)return through>state.finalizedThroughMs;
 return state.actions.some(a=>a.kind==='attack'&&!a.resolved&&Math.min(a.activeUntilMs,state.deadlineMs)<=through);
}
