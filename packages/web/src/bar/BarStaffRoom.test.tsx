import {act,fireEvent,render,screen,waitFor,cleanup} from '@testing-library/react';
import {MemoryRouter,useLocation} from 'react-router-dom';
import {afterEach,expect,it,vi} from 'vitest';
import {BarStaffRoom} from './BarStaffRoom.js';
import {staffRoomEvent} from './staffRoomApi.js';
vi.mock('./staffRoomApi.js',()=>({staffRoomEvent:vi.fn()}));
vi.mock('./OlegFightPanel.js',()=>({OlegFightPanel:({id}:{id:string})=><div>fight:{id}</div>}));
function Location(){const l=useLocation();return <output>{l.pathname}{l.state?.staffRoomWarning?' warning':''}</output>;}
afterEach(()=>{cleanup();vi.useRealTimers();vi.clearAllMocks();});
const mount=()=>render(<MemoryRouter initialEntries={['/bar/staff-room']}><BarStaffRoom/><Location/></MemoryRouter>);
it('quick exit cancels the visit without a warning',async()=>{
 vi.mocked(staffRoomEvent).mockResolvedValue({phase:'scene'});
 sessionStorage.setItem('bar-staff-return-slot','bar-3');mount();
 await waitFor(()=>expect(staffRoomEvent).toHaveBeenCalledWith('enter',expect.any(String)));
 fireEvent.click(screen.getByRole('button',{name:'Вернуться в бар'}));
 expect(staffRoomEvent).toHaveBeenCalledWith('leave',expect.any(String));
 expect(staffRoomEvent).not.toHaveBeenCalledWith('warn',expect.anything());
 expect(sessionStorage.getItem('bar-active-slot')).toBe('bar-3');
});
it('waits for the room image and three seconds then opens Oleg chat',async()=>{
 vi.useFakeTimers();vi.mocked(staffRoomEvent).mockImplementation(async action=>({phase:action==='warn'?'warning':'scene'}));
 const view=mount();await act(async()=>{});
 await act(async()=>vi.advanceTimersByTimeAsync(5000));
 expect(staffRoomEvent).not.toHaveBeenCalledWith('warn',expect.anything());
 fireEvent.load(view.container.querySelector('img')!);
 fireEvent.load(screen.getByAltText('Элина — первый кадр'));
 await act(async()=>vi.advanceTimersByTimeAsync(4000));
 expect(staffRoomEvent).not.toHaveBeenCalledWith('warn',expect.anything());
 fireEvent.load(screen.getByAltText('Элина — второй кадр'));
 expect(view.container.querySelector('main')).toHaveAttribute('data-staff-room-pose','first');
 expect(screen.getByAltText('Элина — первый кадр')).toHaveAttribute('src','/bar/city-v3/elina-office-frame-2-v2.webp');
 expect(screen.getByAltText('Элина — второй кадр')).toHaveAttribute('src','/bar/city-v3/elina-office-frame-1-v2.webp');
 await act(async()=>vi.advanceTimersByTimeAsync(1000));
 expect(view.container.querySelector('main')).toHaveAttribute('data-staff-room-pose','second');
 await act(async()=>vi.advanceTimersByTimeAsync(1999));
 expect(staffRoomEvent).not.toHaveBeenCalledWith('warn',expect.anything());
 await act(async()=>vi.advanceTimersByTimeAsync(1));
 expect(screen.getByText('/bar warning')).toBeInTheDocument();
 expect(vi.mocked(staffRoomEvent).mock.calls.filter(c=>c[0]==='warn')).toHaveLength(1);
});
it('starts the returned fight immediately and leaves won rooms empty',async()=>{
 vi.mocked(staffRoomEvent).mockResolvedValue({phase:'fight',fightId:'linked'});const view=mount();
 expect(await screen.findByText('fight:linked')).toBeInTheDocument();view.unmount();
 vi.mocked(staffRoomEvent).mockResolvedValue({phase:'empty'});const empty=mount();
 await waitFor(()=>expect(empty.container.querySelector('[data-staff-room-phase="empty"]')).not.toBeNull());
 expect(screen.queryByText('fight:linked')).toBeNull();
 expect(screen.queryByAltText('Элина — первый кадр')).toBeNull();
});
