import { expect, it } from 'vitest';
import { appThemeColor } from './App.js';
it('keeps gameplay blue while themed arena and profile chrome are dark',()=>{
 expect(appThemeColor('/','?view=daily&play=1')).toBe('#9cbfdf');
 expect(appThemeColor('/','?view=training&play=1')).toBe('#9cbfdf');
 expect(appThemeColor('/duel/example')).toBe('#9cbfdf');
 expect(appThemeColor('/chat')).toBe('#08182b');
 expect(appThemeColor('/profile')).toBe('#08182b');
 expect(appThemeColor('/privacy')).toBe('#08182b');
 expect(appThemeColor('/prices')).toBe('#08182b');
 expect(appThemeColor('/bonus-games/example/play')).toBe('#9cbfdf');
});
