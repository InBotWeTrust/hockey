import {render,screen,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {BarPlayerAvatar} from './BarPlayerAvatar.js';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it.each([[1000,true],[90_000,false],[null,false]] as const)('shares the 44px avatar and online threshold for age %s',(age,online)=>{
 const now=Date.parse('2026-10-21T12:00:00Z');vi.spyOn(Date,'now').mockReturnValue(now);
 render(<BarPlayerAvatar player={{displayName:'Player',avatarUrl:null,lastSeenAt:age===null?null:new Date(now-age).toISOString()}}/>);
 expect(screen.getByLabelText(`${online?'В сети':'Не в сети'}: Player`)).toBeVisible();
 expect(document.querySelector('.user-avatar')).toHaveStyle({width:'44px',height:'44px'});
});
