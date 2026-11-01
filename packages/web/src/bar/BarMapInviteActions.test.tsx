import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter,useLocation} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {beforeEach,expect,it,vi} from 'vitest';
import {BarMapInviteActions} from './BarMapInviteActions.js';
const mocks=vi.hoisted(()=>({respond:vi.fn(),lobby:vi.fn(),remove:vi.fn(),owner:'owner'}));
vi.mock('../auth/authStore.js',()=>({useAuthStore:{getState:()=>({user:{id:mocks.owner}})}}));
vi.mock('./cards/onlineApi.js',()=>({respond:mocks.respond,lobby:mocks.lobby}));
vi.mock('./games/api.js',()=>({gameApi:{respond:mocks.respond,lobby:mocks.lobby}}));
vi.mock('./games/gameInviteStore.js',()=>({useGameInvites:{getState:()=>({remove:mocks.remove})}}));
function Route(){return <output>{useLocation().pathname}</output>}
function show(incoming=true){render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><BarMapInviteActions id="invite" kind="games" owner="owner" incoming={incoming}/><Route/></MemoryRouter></QueryClientProvider>)}
beforeEach(()=>{vi.resetAllMocks();mocks.owner='owner';mocks.respond.mockResolvedValue({matchId:'match'});mocks.lobby.mockResolvedValue({});});
it('opens accepted game even if the lobby refresh fails',async()=>{mocks.lobby.mockRejectedValue(new Error('offline'));show();fireEvent.click(screen.getByText('Принять'));await waitFor(()=>expect(screen.getByText('/bar/games/match/match')).toBeVisible());});
it.each([['Отклонить','decline',true],['Отменить вызов','cancel',false]] as const)('sends %s once',async(label,action,incoming)=>{show(incoming);fireEvent.click(screen.getByText(label));fireEvent.click(screen.getByText(label));await waitFor(()=>expect(mocks.respond).toHaveBeenCalledWith('invite',action));expect(mocks.respond).toHaveBeenCalledTimes(1);});
it('does not act for a changed account',()=>{show();mocks.owner='other';fireEvent.click(screen.getByText('Принять'));expect(mocks.respond).not.toHaveBeenCalled();});
it('shows response errors',async()=>{mocks.respond.mockRejectedValue(new Error('Истёк срок'));show();fireEvent.click(screen.getByText('Принять'));expect(await screen.findByRole('alert')).toHaveTextContent('Истёк срок');});

it('removes a declined incoming invite immediately even if refresh fails',async()=>{mocks.lobby.mockRejectedValue(new Error("offline"));show();fireEvent.click(screen.getByText("Отклонить"));await waitFor(()=>expect(mocks.remove).toHaveBeenCalledWith("owner","invite"));});
