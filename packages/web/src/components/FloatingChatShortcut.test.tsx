import {fireEvent,render,screen} from '@testing-library/react';
import {MemoryRouter,useLocation,Routes,Route} from 'react-router-dom';
import {afterEach,expect,it,vi} from 'vitest';
import {FloatingChatShortcut,isChatShortcutVisible} from './FloatingChatShortcut.js';
import {ChatExitLink} from '../chat/components/ChatExitLink.js';
afterEach(()=>{vi.unstubAllGlobals();localStorage.clear();sessionStorage.clear();});
function Location(){const location=useLocation();return <output>{location.pathname+location.search}</output>;}
it('shows chat on section pages and hides it only in chat and gameplay',()=>{
 for(const route of ['/sections','/profile/settings','/inventory?tab=history','/daily','/?view=amateur&section=duels','/bar','/bar/games','/bonus-games','/admin']){
 const url=new URL(route,'http://local');expect(isChatShortcutVisible(url)).toBe(true);
 }
 for(const route of ['/chat','/chat/123','/?view=training&play=1','/?view=daily','/?view=classic','/?view=amateur&match=1&play=1','/duel/123','/bar/games/match/123','/bar/cards/match/123','/bar/cards/computer/maria','/bonus-games/123/play']){
 expect(isChatShortcutVisible(new URL(route,'http://local'))).toBe(false);
 }
});
it('returns from chat to the exact source page on mobile, even after reload-style remount',()=>{
 vi.stubGlobal('innerWidth',390);
 const app=<MemoryRouter initialEntries={['/inventory?tab=history']}><FloatingChatShortcut owner="one" unreadCount={7}/><Routes><Route path="*" element={null}/><Route path="/chat" element={<ChatExitLink owner="one"/>}/></Routes><Location/></MemoryRouter>;
 const view=render(app);
 fireEvent.click(screen.getByRole('button',{name:'Открыть чат'}));
 expect(screen.queryByRole('button',{name:'Открыть чат'})).toBeNull();
 expect(screen.getByRole('link',{name:'Выйти из чата'})).toHaveAttribute('href','/inventory?tab=history');
 view.unmount();
 render(<MemoryRouter initialEntries={['/chat']}><FloatingChatShortcut owner="one" unreadCount={7}/><ChatExitLink owner="one"/><Location/></MemoryRouter>);
 fireEvent.click(screen.getByRole('link',{name:'Выйти из чата'}));
 expect(screen.getByText('/inventory?tab=history')).toBeVisible();
});
it('keeps unread messages visible and applies the per-user position',()=>{
 localStorage.setItem('map-chat-position-v1:one','left');
 render(<MemoryRouter initialEntries={['/bar']}><FloatingChatShortcut owner="one" unreadCount={7}/></MemoryRouter>);
 expect(screen.getByRole('button',{name:'Открыть чат'})).toHaveAttribute('data-side','left');
 expect(screen.getByLabelText('Непрочитанные: 7')).toHaveTextContent('7');
});
