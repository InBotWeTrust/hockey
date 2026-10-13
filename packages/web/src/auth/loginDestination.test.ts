import { describe,expect,it } from 'vitest';
describe('fan push login continuation',()=>{
 it('keeps only an internal fan-profile destination',async()=>{
  const module=await import('./loginDestination.js');
  expect(module.loginDestination('/profile?social=fans&fanId=player')).toBe('/profile?social=fans&fanId=player');
  for(const value of [undefined,'//example.com','https://example.com','/profile','/chat']) expect(module.loginDestination(value)).toBe('/');
 });
});
