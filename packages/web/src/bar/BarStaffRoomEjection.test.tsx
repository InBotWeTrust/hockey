import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MemoryRouter,useLocation} from 'react-router-dom';
import {afterEach,expect,it,vi} from 'vitest';
import {BarStaffRoom} from './BarStaffRoom.js';
import {staffRoomEvent} from './staffRoomApi.js';
const reply=vi.hoisted(()=>({day:'2026-10-20',intervention:'office-eject'}));
vi.mock('./staffRoomApi.js',()=>({staffRoomEvent:vi.fn()}));
vi.mock('./OlegFightPanel.js',()=>({OlegFightPanel:()=>null}));
vi.mock('./BarConversation.js',()=>({BarConversation:({onUpdate}:{onUpdate:(value:unknown)=>void})=><button onClick={()=>onUpdate({greeting:'',revision:1,pending:false,turns:[{id:'reply',user:'',assistant:'Выходи',createdAt:new Date().toISOString(),officeDay:reply.day,speaker:'oleg',intervention:reply.intervention}]})}>Ответ Олега</button>}));
function Location(){return <output>{useLocation().pathname}</output>;}
afterEach(()=>{cleanup();vi.useRealTimers();vi.clearAllMocks();});
it.each([['2026-10-19',false],['2026-10-20',true]])('only a current-day ejection leaves the office (%s)',async(day,leaves)=>{
 vi.useFakeTimers();reply.day=day;vi.mocked(staffRoomEvent).mockResolvedValue({phase:'seated',day:'2026-10-20'});
 render(<MemoryRouter initialEntries={['/bar/staff-room']}><BarStaffRoom/><Location/></MemoryRouter>);
 await act(async()=>{});fireEvent.click(screen.getByRole('button',{name:'Разговор'}));fireEvent.click(screen.getByRole('button',{name:'Ответ Олега'}));
 await act(async()=>vi.advanceTimersByTimeAsync(1500));
 expect(screen.getByText(leaves?'/bar':'/bar/staff-room')).toBeInTheDocument();
});

it('closes the conversation, fades to the chair and escorts after fifteen seconds',async()=>{
 vi.useFakeTimers();reply.day='2026-10-20';reply.intervention='office-departure';
 vi.mocked(staffRoomEvent).mockImplementation(async action=>({phase:action==='warn'?'escorted':action==='enter'?'seated':'scene',day:'2026-10-20',warnAfterMs:0}));
 const view=render(<MemoryRouter initialEntries={['/bar/staff-room']}><BarStaffRoom/><Location/></MemoryRouter>);
 await act(async()=>{});fireEvent.load(view.container.querySelector('img')!);
 fireEvent.click(screen.getByRole('button',{name:'Разговор'}));fireEvent.click(screen.getByRole('button',{name:'Ответ Олега'}));
 expect(screen.queryByRole('button',{name:'Ответ Олега'})).toBeNull();
 expect(screen.getByAltText('Пустое кресло Элины')).toBeInTheDocument();
 expect(view.container.querySelector('[data-departing="true"]')).not.toBeNull();
 await act(async()=>vi.advanceTimersByTimeAsync(14999));expect(screen.getByText('/bar/staff-room')).toBeInTheDocument();
 await act(async()=>vi.advanceTimersByTimeAsync(1));expect(screen.getByText('/bar')).toBeInTheDocument();
});

it('does not replay an old departure after a new available visit',async()=>{
 vi.useFakeTimers();reply.day='2026-10-20';reply.intervention='office-departure';
 vi.mocked(staffRoomEvent).mockResolvedValue({phase:'seated',day:reply.day,conversationRevision:1});
 render(<MemoryRouter><BarStaffRoom/></MemoryRouter>);await act(async()=>{});
 fireEvent.click(screen.getByRole('button',{name:'Разговор'}));fireEvent.click(screen.getByRole('button',{name:'Ответ Олега'}));
 expect(screen.getByRole('button',{name:'Ответ Олега'})).toBeInTheDocument();
});
