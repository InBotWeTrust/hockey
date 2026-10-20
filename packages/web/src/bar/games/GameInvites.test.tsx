import { useGameInvites } from './gameInviteStore.js';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { GameInvites } from './GameInvites.js';
import { gameApi } from './api.js';
import { useAuthStore } from '../../auth/authStore.js';
vi.mock('./api.js',()=>({gameApi:{lobby:vi.fn(),respond:vi.fn()}}));
afterEach(()=>{cleanup();vi.clearAllMocks();vi.useRealTimers();useGameInvites.getState().reset(null);useAuthStore.setState({user:null});});
it('shows the card-style invitation and accepts directly onto the table',async()=>{
 useAuthStore.setState({user:{id:'b'} as NonNullable<ReturnType<typeof useAuthStore.getState>['user']>});
 vi.mocked(gameApi.lobby).mockResolvedValue({matchId:null,searching:null,expiresAt:null,serverNow:0,invites:[{id:'i',kind:'billiards',senderId:'a',receiverId:'b',senderName:'Александр',receiverName:'Игрок',status:'pending',matchId:null,expiresAt:Date.now()+60000}]});
 vi.mocked(gameApi.respond).mockResolvedValue({matchId:'m'});
 render(<MemoryRouter><Routes><Route path="/" element={<GameInvites/>}/><Route path="/bar/games/match/m" element={<p>Стол открыт</p>}/></Routes></MemoryRouter>);
 await act(async()=>{});
 expect(screen.getByText('Приглашает сыграть в бильярд')).toBeInTheDocument();
 expect(screen.getByText('Александр')).toBeInTheDocument();
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Принять'}));});
 expect(gameApi.respond).toHaveBeenCalledWith('i','accept');
 expect(screen.getByText('Стол открыт')).toBeInTheDocument();
});

const invitation={id:'i',kind:'darts' as const,senderId:'a',receiverId:'b',senderName:'Александр',receiverName:'Игрок',status:'pending',matchId:null,expiresAt:61000};
const lobbyWith=(invites:typeof invitation[])=>({matchId:null,searching:null,expiresAt:null,serverNow:1000,invites});
function mountInvites(){useAuthStore.setState({user:{id:'b'} as NonNullable<ReturnType<typeof useAuthStore.getState>['user']>});return render(<MemoryRouter><GameInvites/></MemoryRouter>);}
it('expires badge invitations even when the next lobby request fails',async()=>{
 vi.useFakeTimers();vi.setSystemTime(1000);
 vi.mocked(gameApi.lobby).mockResolvedValueOnce(lobbyWith([{...invitation,expiresAt:2000}])).mockRejectedValue(new Error('offline'));
 mountInvites();await act(async()=>{});
 expect(useGameInvites.getState().incoming).toHaveLength(1);
 await act(async()=>vi.advanceTimersByTimeAsync(3000));
 expect(useGameInvites.getState().incoming).toHaveLength(0);
 expect(screen.queryByText('Приглашает сыграть в дартс')).toBeNull();
});
it('does not restore an acknowledged invitation from an older in-flight poll',async()=>{
 vi.useFakeTimers();vi.setSystemTime(1000);
 let finish!:(result:ReturnType<typeof lobbyWith>)=>void;
 vi.mocked(gameApi.lobby).mockResolvedValueOnce(lobbyWith([invitation])).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 vi.mocked(gameApi.respond).mockResolvedValue({matchId:null});
 mountInvites();await act(async()=>{});
 await act(async()=>vi.advanceTimersByTimeAsync(3000));
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Отклонить'})));
 await act(async()=>finish(lobbyWith([invitation])));
 expect(useGameInvites.getState().incoming).toHaveLength(0);
});
it('rejects a previous account response after the signed-in user changes',async()=>{
 vi.useFakeTimers();vi.setSystemTime(1000);
 let finish!:(result:ReturnType<typeof lobbyWith>)=>void;
 vi.mocked(gameApi.lobby).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce(lobbyWith([]));
 mountInvites();await act(async()=>{});
 await act(async()=>useAuthStore.setState({user:{id:'new-user'} as NonNullable<ReturnType<typeof useAuthStore.getState>['user']>}));
 await act(async()=>finish(lobbyWith([invitation])));
 expect(useGameInvites.getState().owner).toBe('new-user');
 expect(useGameInvites.getState().incoming).toHaveLength(0);
});
