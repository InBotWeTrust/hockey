import {expect,it} from 'vitest';
import {emotionAsset,emotionFromSnapshot,canGreet,entryEmotion} from './characterEmotion.js';
it('restricts image selection to authored characters and emotions',()=>{
 expect(emotionAsset('maria','joy')).toBe('/bar/emotions/maria/joy-v1.webp');
 expect(emotionAsset('timofey','joy')).toBeNull();
 expect(emotionAsset('daria','../../secret')).toBe('/bar/emotions/daria/neutral-v1.webp');
});
it('keeps unresolved conflicts displeased and never greets grief or insults with joy',()=>{
 const base={greeting:'',revision:1,pending:false,turns:[{id:'1',user:'',assistant:'',createdAt:new Date().toISOString(),emotion:'empathy' as const}]};
 expect(canGreet(base)).toBe(false);
 expect(emotionFromSnapshot({...base,interventionActive:true})).toBe('displeasure');
 expect(canGreet({...base,turns:[]})).toBe(true);
});

it('preserves recent displeasure on entry but lets an old resolved conflict fade',()=>{
 const base={greeting:'',revision:1,pending:false,interventionActive:false,turns:[{id:'1',user:'',assistant:'',createdAt:new Date().toISOString(),emotion:'displeasure' as const}]};
 expect(entryEmotion(base)).toBe('displeasure');
 const old={...base,turns:[{...base.turns[0]!,createdAt:new Date(Date.now()-7*60*60*1000).toISOString()}]};
 expect(entryEmotion(old)).toBe('neutral');
 expect(entryEmotion({...old,interventionActive:true})).toBe('displeasure');
});
