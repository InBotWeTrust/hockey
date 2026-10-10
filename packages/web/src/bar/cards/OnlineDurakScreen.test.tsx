import {render,screen,act,cleanup,fireEvent} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {it,expect,vi,afterEach} from 'vitest';
import {OnlineDurakScreen} from './OnlineDurakScreen.js';
import * as api from './onlineApi.js';
vi.mock('./onlineApi.js',async importOriginal=>({...await importOriginal<typeof api>(),snapshot:vi.fn(),move:vi.fn()}));
const view:api.OnlineSnapshot={id:'match',hand:[{id:'hearts-6',suit:'hearts',rank:6}],opponentCount:6,deckCount:24,trump:'clubs',trumpCard:{id:'clubs-9',rank:9,suit:'clubs'},attacker:0,table:[],limit:6,phase:'attack',revision:0,result:null,deadline:Date.now()+20000,serverNow:Date.now(),opponent:{displayName:'Олег',avatarUrl:null}};
const mount=()=>render(<MemoryRouter initialEntries={['/bar/cards/match/match']}><Routes><Route path="/bar/cards/match/:id" element={<OnlineDurakScreen/>}/></Routes></MemoryRouter>);
afterEach(()=>{cleanup();vi.clearAllMocks();vi.useRealTimers();});
it('keeps newer server state when an older poll arrives after a move',async()=>{
 vi.useFakeTimers();let stale!:(next:api.OnlineSnapshot)=>void;
 vi.mocked(api.snapshot).mockResolvedValueOnce(view).mockImplementationOnce(()=>new Promise(resolve=>{stale=resolve;}));
 vi.mocked(api.move).mockResolvedValue({...view,revision:1,phase:'defend',hand:[],table:[{attack:view.hand[0]!}]});mount();await act(async()=>{});
 await act(async()=>{vi.advanceTimersByTime(1500);});
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'6 ♥'}));});
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'6 ♥'}));});
 expect(screen.queryByRole('button',{name:'6 ♥'})).not.toBeInTheDocument();await act(async()=>stale(view));expect(screen.queryByRole('button',{name:'6 ♥'})).not.toBeInTheDocument();
 expect(screen.getByText('Ход соперника')).toBeInTheDocument();expect(screen.getByRole('img',{name:'Соперник с картами'})).toBeInTheDocument();
});
it('restores the persisted hand after a transient connection failure',async()=>{
 vi.useFakeTimers();vi.mocked(api.snapshot).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(view);mount();await act(async()=>{});expect(screen.getByText('Связь потеряна. Восстанавливаем…')).toBeInTheDocument();await act(async()=>{vi.advanceTimersByTime(1500);});expect(screen.getByRole('button',{name:'6 ♥'})).toBeInTheDocument();
});
