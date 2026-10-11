import { expect,it } from 'vitest';
import { physicalEffect } from './physicalIncident.js';
it('intervenes immediately and escalates only after an active warning',()=>{
 expect(physicalEffect({warnings:0,intervening:false})).toEqual({warnings:1,intervening:true,kind:'intervention'});
 expect(physicalEffect({warnings:3,intervening:false})).toEqual({warnings:4,intervening:true,kind:'intervention'});
 expect(physicalEffect({warnings:1,intervening:true})).toEqual({warnings:2,intervening:false,kind:'fight'});
});
