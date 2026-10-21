import {afterEach,expect,it} from 'vitest';
import {sectionEntryRoute} from './sectionEntry.js';
afterEach(()=>localStorage.clear());
it('restores the stadium tab for its owner after session storage clears',()=>{
 localStorage.setItem('section-scroll:one:stadium:selected','duels');sessionStorage.clear();
 expect(sectionEntryRoute('stadium','/daily','one','amateur',true)).toBe('/?view=amateur&section=duels&from=sections');
 expect(sectionEntryRoute('stadium','/daily','two','amateur',true)).toBe('/daily');
});
it('rejects obsolete or unavailable tabs and never restores gameplay URLs',()=>{
 localStorage.setItem('section-scroll:one:yard:selected','advanced');
 expect(sectionEntryRoute('yard','/daily','one','beginner',false)).toBe('/?view=training&section=open&from=sections');
 localStorage.setItem('section-scroll:one:stadium:selected','/play?match=123');
 expect(sectionEntryRoute('stadium','/daily','one','amateur',true)).toBe('/daily');
});
it('restores profile, bank, shop and bonus tabs using valid routes',()=>{
 for(const [scene,tab,expected] of [['apartment','settings','/profile/settings'],['bank','history','/inventory?tab=history'],['shop','stick','/inventory?category=stick'],['bonus','accuracy','/bonus-games?skill=accuracy']] as const){
 localStorage.setItem(`section-scroll:one:${scene}:selected`,tab);
 expect(sectionEntryRoute(scene==='apartment'?'profile':scene,'/fallback','one','amateur',true)).toBe(expected);
 }
});
