import { expect,it } from 'vitest';
import { FightHeldControls } from './fightHeldControls.js';
it('independent pointers and opposite arrows survive individual release',()=>{
 const c=new FightHeldControls();c.press(1,'left');c.press(2,'down');c.press(3,'guard');
 expect(c.input).toEqual({direction:-1,crouch:true,guard:true});c.press(4,'right');expect(c.input.direction).toBe(0);
 c.release(1);expect(c.input).toEqual({direction:1,crouch:true,guard:true});c.release(2);expect(c.input.crouch).toBe(false);expect(c.input.guard).toBe(true);
 c.clear();expect(c.input).toEqual({direction:0,crouch:false,guard:false});
});
