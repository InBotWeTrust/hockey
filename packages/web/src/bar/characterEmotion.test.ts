import {expect,it} from 'vitest';
import {emotionAsset,emotionFromSnapshot,canGreet} from './characterEmotion.js';
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
