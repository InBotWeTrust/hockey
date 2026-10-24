import { expect, it } from 'vitest';
import { chooseCityImageSize } from './lighting.js';
it('uses a bounded background pixel density for a tall high-DPR phone', () => {
  expect(chooseCityImageSize({width:390,height:844,dpr:3})).toBe(4096);
});
it('retains detail for large displays and caps constrained devices', () => {
  expect(chooseCityImageSize({width:1024,height:1200,dpr:2})).toBe(6144);
  expect(chooseCityImageSize({width:1024,height:1200,dpr:2,saveData:true})).toBe(4096);
  expect(chooseCityImageSize({width:1024,height:1200,dpr:2,deviceMemory:4})).toBe(4096);
});
