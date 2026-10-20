import type { FightHeldInput } from '@hockey/game-core';
export type FightControl='left'|'right'|'down'|'guard';
export class FightHeldControls {
 private pointers=new Map<number,FightControl>();
 press(id:number,control:FightControl):void{this.pointers.set(id,control);}
 release(id:number):void{this.pointers.delete(id);}
 clear():void{this.pointers.clear();}
 get input():FightHeldInput{const values=[...this.pointers.values()];return {direction:(Number(values.includes('right'))-Number(values.includes('left'))) as -1|0|1,crouch:values.includes('down'),guard:values.includes('guard')};}
}
