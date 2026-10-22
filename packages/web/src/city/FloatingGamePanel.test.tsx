import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {afterEach,expect,it,vi} from 'vitest';
import {FloatingGamePanel} from './FloatingGamePanel.js';
import type {ArenaEntry} from '../screens/DailyScreen.js';
afterEach(()=>localStorage.clear());
const daily:ArenaEntry={id:'daily',kind:'daily',eyebrow:'Ежедневная игра',title:'Период доступен',subtitle:'',meta:'',ctaLabel:'На лёд',dockState:'ready',onEnter:()=>{}};
const props={owner:'test',entries:[daily],activeIndex:0,onActiveIndexChange:vi.fn(),renderFace:(e:ArenaEntry)=><article>{e.title}</article>,renderActions:()=> <button>На лёд</button>};
function show(override:Partial<typeof props>={}){return render(<MemoryRouter initialEntries={['/?view=training&play=1']}><div className="app-shell"><FloatingGamePanel {...props} {...override}/></div></MemoryRouter>);}
it('shows a neutral square during gameplay and opens a complete window without the old summary',async()=>{
 show();const button=screen.getByRole('button',{name:'Открыть игры'});
 expect(button).toHaveClass('floating-games','floating-shortcut--playing');
 expect(screen.getByLabelText('Незавершённых игр: 1')).toHaveClass('floating-shortcut__badge--neutral');
 fireEvent.click(button);
 await waitFor(()=>expect(screen.getByRole('dialog',{name:'Игры'})).toBeVisible());
 expect(screen.getByText('Период доступен')).toBeVisible();expect(screen.getByRole('button',{name:'На лёд'})).toBeVisible();
 expect(screen.queryByText('Ежедневная игра')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Свернуть игры'}));
 expect(screen.getByRole('button',{name:'Открыть игры'})).toBeVisible();
});
it('turns red for an unfinished duel and prefers that entry when opening',()=>{
 const change=vi.fn();show({entries:[daily,{...daily,id:'duel',kind:'duel',dockState:'blocked'}],onActiveIndexChange:change});
 expect(screen.getByLabelText('Незавершённых игр: 2')).not.toHaveClass('floating-shortcut__badge--neutral');
 fireEvent.click(screen.getByRole('button',{name:'Открыть игры'}));expect(change).toHaveBeenCalledWith(1);
});
it('hides the badge after all games are completed',()=>{
 show({entries:[{...daily,dockState:'done'}]});expect(screen.queryByLabelText(/Незавершённых игр:/)).toBeNull();
});

it('drags the window by its handle and restores its position after remounting',async()=>{
 const view=show();fireEvent.click(screen.getByRole('button',{name:'Открыть игры'}));
 const handle=screen.getByRole('button',{name:'Переместить окно игр'});
 const dialog=screen.getByRole('dialog',{name:'Игры'});
 vi.spyOn(dialog,'getBoundingClientRect').mockReturnValue({x:100,y:12,left:100,top:12,width:430,height:260,right:530,bottom:272,toJSON:()=>({})});
 fireEvent.pointerDown(handle,{pointerId:1,isPrimary:true,button:0,clientX:200,clientY:25});
 fireEvent.pointerMove(handle,{pointerId:1,isPrimary:true,clientX:250,clientY:125});
 fireEvent.pointerUp(handle,{pointerId:1,isPrimary:true,clientX:250,clientY:125});
 expect(dialog).toHaveStyle({left:'150px',top:'112px'});
 view.unmount();show();fireEvent.click(screen.getByRole('button',{name:'Открыть игры'}));
 await waitFor(()=>expect(screen.getByRole('dialog',{name:'Игры'})).toHaveStyle({left:'150px',top:'112px'}));
});
it('keeps a saved window reachable after a smaller viewport and separates accounts',async()=>{
 localStorage.setItem('floating-games-window-v1:test',JSON.stringify({x:9000,y:9000}));
 const view=show();fireEvent.click(screen.getByRole('button',{name:'Открыть игры'}));
 const dialog=screen.getByRole('dialog',{name:'Игры'});
 await waitFor(()=>expect(parseFloat(dialog.style.top)).toBeLessThan(window.innerHeight));
 expect(parseFloat(dialog.style.left)).toBeLessThan(window.innerWidth);
 view.unmount();show({owner:'another'});fireEvent.click(screen.getByRole('button',{name:'Открыть игры'}));
 expect(screen.getByRole('dialog',{name:'Игры'}).style.left).toBe('');
});
it('opens a tournament before daily and training every time, even after browsing another card',()=>{
 const change=vi.fn();show({entries:[daily,{...daily,id:'cup',kind:'classic',dockState:'active'}],onActiveIndexChange:change});
 fireEvent.click(screen.getByRole('button',{name:'Открыть игры'}));expect(change).toHaveBeenLastCalledWith(1);
 fireEvent.click(screen.getByRole('button',{name:'Свернуть игры'}));
 change.mockClear();fireEvent.click(screen.getByRole('button',{name:'Открыть игры'}));expect(change).toHaveBeenCalledWith(1);
});

it('centers the initial window vertically before any position has been saved',()=>{
 show({owner:'fresh-position'});fireEvent.click(screen.getByRole('button',{name:'Открыть игры'}));
 const dialog=screen.getByRole('dialog',{name:'Игры'});
 expect(dialog.parentElement).toHaveStyle({alignItems:'center'});
 expect(dialog.style.top).toBe('');expect(dialog.style.left).toBe('');
});
