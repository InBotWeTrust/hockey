import {expect,it} from 'vitest';
import {caretakerEquipment} from './caretakerEquipment.js';
it('always uses a shovel in the yard',()=>{
 for(let i=0;i<100;i++)expect(caretakerEquipment('yard',String(i),1)).toBe('shovel');
});
it('chooses both tools at the stadium and preserves a break choice',()=>{
 const choices=Array.from({length:100},(_,i)=>caretakerEquipment('stadium',String(i),2));
 expect(new Set(choices)).toEqual(new Set(['shovel','machine']));
 expect(caretakerEquipment('stadium','same-seed',2)).toBe(caretakerEquipment('stadium','same-seed',2));
});
