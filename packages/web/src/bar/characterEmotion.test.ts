import {expect,it,vi} from 'vitest';
import {emotionAsset,emotionFromSnapshot,canGreet,entryEmotion,prepareGreeting} from './characterEmotion.js';
it.each(['grigory','arsenich','oleg','igor','timofey'] as const)('preloads the real handshake sprite for %s instead of a smiling-face overlay',async character=>{
 const images:Array<{src:string;onload:(()=>void)|null;onerror:(()=>void)|null}>=[];
 vi.stubGlobal('Image',class{src='';onload=null;onerror=null;constructor(){images.push(this);}});
 try {
  expect(emotionAsset(character,'greeting')).toBe(`/bar/greetings/${character}-v1.webp`);
  const ready=prepareGreeting(character);
  expect(images[0]?.src).toBe(`/bar/greetings/${character}-v1.webp`);
  images[0]?.onload?.();
  expect(await ready).toBe(true);
 }finally{vi.unstubAllGlobals();}
});
it('skips a handshake if its image fails to load',async()=>{
 const images:Array<{onerror:(()=>void)|null}>=[];
 vi.stubGlobal('Image',class{src='';onload=null;onerror=null;constructor(){images.push(this);}});
 try{
  const ready=prepareGreeting('timofey');
  expect(images).toHaveLength(1);
  images[0]!.onerror?.();
  expect(await ready).toBe(false);
 }finally{vi.unstubAllGlobals();}
});
it('restricts image selection to authored characters and emotions',()=>{
 expect(emotionAsset('maria','joy')).toBe('/bar/emotions/maria/joy-v1.webp');
 expect(emotionAsset('timofey','joy')).toBe('/bar/emotions/timofey/joy-v1.webp');
 expect(emotionAsset('daria','../../secret')).toBe('/bar/emotions/daria/neutral-v1.webp');
});
it('keeps unresolved conflicts displeased and never greets grief or insults with joy',()=>{
 const base={greeting:'',revision:1,pending:false,turns:[{id:'1',user:'',assistant:'',createdAt:new Date().toISOString(),emotion:'empathy' as const}]};
 expect(canGreet(base)).toBe(false);
 expect(emotionFromSnapshot({...base,interventionActive:true})).toBe('displeasure');
 expect(canGreet({...base,turns:[]})).toBe(true);
});

it('preserves today’s displeasure and keeps an unresolved conflict across days',()=>{
 vi.useFakeTimers();
 try{
  vi.setSystemTime(new Date(2026,9,16,12));
  const base={greeting:'',revision:1,pending:false,interventionActive:false,turns:[{id:'1',user:'',assistant:'',createdAt:new Date(2026,9,16,1).toISOString(),emotion:'displeasure' as const}]};
  expect(entryEmotion(base)).toBe('displeasure');
  const old={...base,turns:[{...base.turns[0]!,createdAt:new Date(2026,9,15,23).toISOString()}]};
  expect(entryEmotion(old)).toBe('neutral');
  expect(entryEmotion({...old,interventionActive:true})).toBe('displeasure');
  expect(canGreet({...old,interventionActive:true})).toBe(false);
 }finally{vi.useRealTimers();}
});

it('restores every emotion from today, and resets yesterday at local midnight',()=>{
 vi.useFakeTimers();
 try{
  vi.setSystemTime(new Date(2026,9,16,0,5));
  for(const emotion of ['joy','interest','surprise','empathy','displeasure'] as const){
   const data={greeting:'',revision:1,pending:false,turns:[{id:'1',user:'',assistant:'',createdAt:new Date(2026,9,16,0,1).toISOString(),emotion}]};
   expect(entryEmotion(data)).toBe(emotion);
   const yesterday={...data,turns:[{...data.turns[0]!,createdAt:new Date(2026,9,15,23,59).toISOString()}]};
   expect(entryEmotion(yesterday)).toBe('neutral');
   expect(canGreet(yesterday)).toBe(true);
  }
 }finally{vi.useRealTimers();}
});
it('preloads Daria’s distinct greeting smile while preserving her conversational joy gesture',async()=>{
 const images:Array<{src:string;onload:(()=>void)|null}>=[];
 vi.stubGlobal('Image',class{src='';onload=null;onerror=null;constructor(){images.push(this);}});
 try{
  const ready=prepareGreeting('daria');
  expect(images[0]?.src).toBe('/bar/emotions/daria/greeting-smile-v1.webp');
  images[0]?.onload?.();
  expect(await ready).toBe(true);
  expect(emotionAsset('daria','joy')).toBe('/bar/emotions/daria/joy-v1.webp');
 }finally{vi.unstubAllGlobals();}
});

it('loads the revised low-hand interest pose for Timofey without changing other emotions',()=>{
 expect(emotionAsset('timofey','interest')).toBe('/bar/emotions/timofey/interest-v2.webp');
 expect(emotionAsset('timofey','neutral')).toBe('/bar/emotions/timofey/neutral-v1.webp');
 expect(emotionAsset('timofey','joy')).toBe('/bar/emotions/timofey/joy-v1.webp');
});
it.each(['neutral','joy','interest','surprise','empathy','displeasure'])('uses a fresh URL for corrected Veronika %s',emotion=>{
 expect(emotionAsset('veronika',emotion)).toBe(`/bar/emotions/veronika/${emotion}-v2.webp`);
});
