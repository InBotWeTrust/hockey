import {expect,it} from 'vitest';
import {staffRoomPhase,canWarn} from './staffRoom.js';
it('only warns after three seconds on the current entry',()=>{
 expect(canWarn('entry','entry',1000,3999)).toBe(false);
 expect(canWarn('entry','entry',1000,4000)).toBe(true);
 expect(canWarn('other','entry',1000,5000)).toBe(false);
 expect(canWarn(null,'entry',1000,5000)).toBe(false);
});
it('only the linked won fight empties the room until day reset',()=>{
 expect(staffRoomPhase(false,null,null)).toBe('scene');
 expect(staffRoomPhase(true,null,null)).toBe('fight');
 expect(staffRoomPhase(true,'fight','win')).toBe('empty');
 expect(staffRoomPhase(true,'fight',null)).toBe('fight');
});
