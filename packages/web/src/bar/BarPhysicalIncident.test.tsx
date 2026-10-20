import type {ReactNode} from 'react';import type {BarCharacter} from './conversationApi.js';
import {it,expect,vi,beforeEach} from 'vitest';import {render,screen,fireEvent,waitFor} from '@testing-library/react';import {MemoryRouter} from 'react-router-dom';import {createDefaultBarLayout} from '@hockey/game-core';import {BarPanorama} from './BarPanorama.js';import {sendPhysicalIncident,fetchConversation,barCharacters} from './conversationApi.js';
vi.mock('./layoutApi.js',()=>({fetchBarLayout:vi.fn().mockResolvedValue({layout:createDefaultBarLayout()})}));
vi.mock('./conversationApi.js',()=>({barCharacters:['maria','daria','oleg'],fetchConversation:vi.fn(),sendPhysicalIncident:vi.fn()}));
vi.mock('./BarScene.js',()=>({BarScene:({onPhysicalIncident,notice}:{onPhysicalIncident?:(c:BarCharacter)=>void;notice:ReactNode})=><div>{barCharacters.map(c=><button key={c} disabled={!onPhysicalIncident} onClick={()=>onPhysicalIncident?.(c)}>{c}</button>)}{notice}</div>}));
vi.mock('./BarConversation.js',()=>({BarConversation:({name}:{name:string})=><div>Разговор: {name}</div>}));
beforeEach(()=>{vi.clearAllMocks();vi.mocked(fetchConversation).mockResolvedValue({greeting:'Привет',revision:0,pending:false,turns:[]});});
it('disables new gestures after uncertain delivery and retries the same incident explicitly',async()=>{
 vi.mocked(sendPhysicalIncident).mockRejectedValueOnce(new Error('offline')).mockResolvedValue({greeting:'Привет',revision:1,pending:false,turns:[]});
 render(<MemoryRouter><BarPanorama/></MemoryRouter>);fireEvent.click(screen.getByRole('button',{name:'maria'}));await screen.findByText('Не удалось вызвать Олега.');
 expect(screen.getByRole('button',{name:'daria'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'daria'}));expect(sendPhysicalIncident).toHaveBeenCalledTimes(1);
 const first=vi.mocked(sendPhysicalIncident).mock.calls[0];fireEvent.click(screen.getByRole('button',{name:'Повторить'}));await waitFor(()=>expect(sendPhysicalIncident).toHaveBeenCalledTimes(2));expect(vi.mocked(sendPhysicalIncident).mock.calls[1]).toEqual(first);await screen.findByText('Разговор: Мария');
});
