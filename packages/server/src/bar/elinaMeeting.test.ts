import {describe,it,expect} from 'vitest';
import {advanceMeeting,beginMeeting,resolvePresence} from './elinaMeeting.js';
const now=Date.parse('2026-10-21T12:00:00Z');
describe('Elina meeting policy',()=>{
 it('warns a beginner on the first message and leaves on the second',()=>{
  const start=beginMeeting(null,now,false,0);
  const first=advanceMeeting(start,now,'none');
  expect(first).toMatchObject({remaining:1,action:'warning',successful:false});
  expect(advanceMeeting(first,now+1000,'none')).toMatchObject({remaining:0,action:'leave'});
 });
 it('gives amateurs five messages and grants each new substantive continuation five more',()=>{
  let state=beginMeeting(null,now,true,0);
  for(let n=0;n<3;n++)state=advanceMeeting(state,now+n,'none');
  expect(state.remaining).toBe(2);
  state=advanceMeeting(state,now+4,'business');
  expect(state).toMatchObject({remaining:6,successful:true,action:'continue'});
  for(let n=0;n<5;n++)state=advanceMeeting(state,now+5+n,'none');
  expect(state.action).toBe('warning');
  expect(advanceMeeting(state,now+11,'none').action).toBe('leave');
 });
 it('does not unlock personal topics during the second successful meeting',()=>{
  const second=beginMeeting(null,now,true,1);
  expect(advanceMeeting(second,now,'personal')).toMatchObject({successful:false,remaining:4});
  const success=advanceMeeting(second,now,'business');
  expect(success.personalAllowed).toBe(false);
  expect(beginMeeting(null,now+1,true,2).personalAllowed).toBe(true);
 });
 it('resumes a meeting across refreshes but expires it after thirty idle minutes',()=>{
  const first=advanceMeeting(beginMeeting(null,now,false,0),now,'none');
  expect(beginMeeting(first,now+1799999,true,2)).toEqual(first);
  expect(beginMeeting(first,now+1800000,true,2)).toMatchObject({remaining:5,personalAllowed:true,successful:false});
 });
 it('holds a presence draw for thirty minutes and respects absence across expiry',()=>{
  const present=resolvePresence(null,now,false,.399);
  expect(present).toEqual({mode:'seated',until:now+1800000,absentUntil:0});
  expect(resolvePresence(present,now+100,false,.99)).toEqual(present);
  expect(resolvePresence(null,now,false,.4).mode).toBe('empty');
  expect(resolvePresence({...present,absentUntil:now+2400000},now+1800001,false,0).mode).toBe('empty');
  expect(resolvePresence(present,now,true,0).mode).toBe('scene');
 });
});
