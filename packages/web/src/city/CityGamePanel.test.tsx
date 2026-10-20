import {fireEvent,render,screen} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {CityGamePanel as CityGamePanelView} from './CityGamePanel.js';
import {ArenaCubeFace,ArenaCubeActions} from '../screens/DailyScreen.js';
import type {ComponentProps} from 'react';
function CityGamePanel(props:Omit<ComponentProps<typeof CityGamePanelView>,'renderFace'|'renderActions'>){return <CityGamePanelView {...props} renderFace={entry=><ArenaCubeFace entry={entry}/>} renderActions={entry=><ArenaCubeActions entry={entry}/>}/>;}
beforeEach(()=>localStorage.clear());
const enter=vi.fn();
const entries=[{id:'daily',kind:'daily' as const,eyebrow:'Ежедневная игра',title:'Завершена',subtitle:'Следующий старт после обновления',meta:'',ctaLabel:'На лёд',onEnter:enter},
 {id:'later',kind:'duel' as const,eyebrow:'Дуэль',title:'Соперник',subtitle:'',meta:'',ctaLabel:'Продолжить',onEnter:enter,attention:true,deadlineAt:200},
 {id:'soon',kind:'classic' as const,eyebrow:'Турнир',title:'Кубок',subtitle:'',meta:'',ctaLabel:'Начать',onEnter:enter,attention:true,deadlineAt:100}];
it('starts collapsed and opens the most urgent actionable game from its notification',()=>{
 const change=vi.fn();render(<CityGamePanel entries={entries} activeIndex={0} onActiveIndexChange={change}/>);
 expect(screen.queryByRole('button',{name:'На лёд'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Игры требуют действия: 2'}));expect(change).toHaveBeenCalledWith(2);
 expect(screen.getByRole('button',{name:'Свернуть игры'})).toBeVisible();
});
it('keeps browsing and game actions available when expanded',()=>{
 const change=vi.fn();enter.mockClear();render(<CityGamePanel entries={entries} activeIndex={0} onActiveIndexChange={change}/>);
 fireEvent.click(screen.getByRole('button',{name:'Развернуть игры'}));
 fireEvent.click(screen.getByRole('button',{name:'Следующая игра'}));expect(change).toHaveBeenCalledWith(1);
 fireEvent.click(screen.getByRole('button',{name:'На лёд'}));expect(enter).toHaveBeenCalledOnce();
 fireEvent.click(screen.getByRole('button',{name:'Свернуть игры'}));expect(screen.queryByRole('button',{name:'На лёд'})).not.toBeInTheDocument();
});
it('hides notification without actionable games and preserves invite actions',()=>{
 render(<CityGamePanel entries={[{...entries[0]!,secondaryActions:<button>Принять</button>}]} activeIndex={0} onActiveIndexChange={()=>{}}/>);
 expect(screen.queryByRole('button',{name:/Игры требуют действия/})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Развернуть игры'}));expect(screen.getByRole('button',{name:'Принять'})).toBeVisible();expect(screen.queryByRole('button',{name:'На лёд'})).not.toBeInTheDocument();
});
it('removes resolved notifications and prevents disabled game actions',()=>{
 enter.mockClear();const view=render(<CityGamePanel entries={entries} activeIndex={0} onActiveIndexChange={()=>{}}/>);
 expect(screen.getByRole('button',{name:'Игры требуют действия: 2'})).toBeVisible();
 view.rerender(<CityGamePanel entries={[{...entries[0]!,disabled:true}]} activeIndex={0} onActiveIndexChange={()=>{}}/>);
 expect(screen.queryByRole('button',{name:/Игры требуют действия/})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Развернуть игры'}));expect(screen.queryByRole('button',{name:'На лёд'})).not.toBeInTheDocument();expect(enter).not.toHaveBeenCalled();
});
it('switches games on a horizontal swipe without firing the action underneath',()=>{
 enter.mockClear();const change=vi.fn();render(<CityGamePanel entries={entries} activeIndex={0} onActiveIndexChange={change}/>);
 fireEvent.click(screen.getByRole('button',{name:'Развернуть игры'}));const details=document.getElementById('city-game-details')!;
 fireEvent.pointerDown(details,{pointerId:1,clientX:200,clientY:100});fireEvent.pointerUp(details,{pointerId:1,clientX:100,clientY:100});
 expect(change).toHaveBeenCalledWith(1);fireEvent.click(screen.getByRole('button',{name:'На лёд'}),{detail:1});expect(enter).not.toHaveBeenCalled();
});

it('shows the exact cube opponent identity, venue and every face text',()=>{
 render(<CityGamePanel entries={[{...entries[1]!,opponentName:'Соперник',opponentAvatarUrl:'/opponent.webp',typeLabel:'Экспресс',venueRole:'home',eyebrowStatus:'Ваша очередь',subtitle:'Точный текст куба'}]} activeIndex={0} onActiveIndexChange={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Развернуть игры'}));
 expect(document.querySelector('img[src="/opponent.webp"]')).not.toBeNull();
 expect(screen.getByText('Точный текст куба')).toBeVisible();expect(screen.getByText('Экспресс')).toBeVisible();expect(screen.getByText('Соперник',{selector:'.arena-duel-opponent-name'})).toBeVisible();expect(screen.getByLabelText(/Площадка:/)).toBeVisible();
});
it('restores expanded and collapsed state after leaving the page',()=>{
 const first=render(<CityGamePanel entries={entries} activeIndex={0} onActiveIndexChange={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Развернуть игры'}));first.unmount();
 const next=render(<CityGamePanel entries={entries} activeIndex={1} onActiveIndexChange={()=>{}}/>);
 expect(screen.getByRole('button',{name:'Свернуть игры'})).toBeVisible();
 next.rerender(<CityGamePanel entries={entries} activeIndex={2} onActiveIndexChange={()=>{}}/>);expect(screen.getByRole('button',{name:'Свернуть игры'})).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Свернуть игры'}));next.unmount();
 render(<CityGamePanel entries={entries} activeIndex={0} onActiveIndexChange={()=>{}}/>);expect(screen.getByRole('button',{name:'Развернуть игры'})).toBeVisible();
});
it('opens the urgent game when requested from the venue circle',()=>{
 const change=vi.fn();const view=render(<CityGamePanel entries={entries} activeIndex={0} onActiveIndexChange={change} openRequest={0}/>);
 view.rerender(<CityGamePanel entries={entries} activeIndex={0} onActiveIndexChange={change} openRequest={1}/>);
 expect(change).toHaveBeenCalledWith(2);expect(screen.getByRole('button',{name:'Свернуть игры'})).toBeVisible();
});
it('adds daily and training to the neutral total and removes completed games',()=>{
 const change=vi.fn();const daily={...entries[0]!,dockState:'ready' as const};const training={...daily,id:'training',kind:'training' as const};
 const view=render(<CityGamePanel entries={[daily,training]} activeIndex={0} onActiveIndexChange={change}/>);
 expect(screen.getByRole('button',{name:'Игры требуют действия: 2'})).toBeVisible();
 view.rerender(<CityGamePanel entries={[daily,training,entries[1]!]} activeIndex={0} onActiveIndexChange={change}/>);
 fireEvent.click(screen.getByRole('button',{name:'Игры требуют действия: 3'}));expect(change).toHaveBeenCalledWith(2);
 view.rerender(<CityGamePanel entries={[{...daily,dockState:'done'},{...training,dockState:'done'}]} activeIndex={0} onActiveIndexChange={change}/>);
 expect(screen.queryByRole('button',{name:/Игры требуют действия/})).not.toBeInTheDocument();
});
it('does not repeat the training title in the collapsed summary',()=>{
 render(<CityGamePanel entries={[{...entries[0]!,kind:'training',title:'Тренировка',eyebrow:'Тренировка'}]} activeIndex={0} onActiveIndexChange={()=>{}}/>);
 expect(screen.getByRole('button',{name:'Развернуть игры'}).textContent).toBe('Тренировка');
});
it.each([['ready','35/100 бросков сегодня','35/100 бросков сегодня'],['done','100/100 бросков сегодня','Завершена · 100/100 бросков сегодня']])('shows training progress in collapsed %s summary',(state,meta,expected)=>{
 render(<CityGamePanel entries={[{...entries[0]!,kind:'training',title:'Тренировка',eyebrow:'Тренировка',dockState:state as 'ready'|'done',meta}]} activeIndex={0} onActiveIndexChange={()=>{}}/>);
 expect(screen.getByRole('button',{name:'Развернуть игры'})).toHaveTextContent(expected);
});
it('switches games using dots and tracks the active entry',()=>{
 const change=vi.fn();const view=render(<CityGamePanel entries={entries} activeIndex={0} onActiveIndexChange={change}/>);
 fireEvent.click(screen.getByRole('button',{name:'Развернуть игры'}));
 expect(screen.getByRole('button',{name:'Выбрать Ежедневная игра'})).toHaveAttribute('aria-pressed','true');
 fireEvent.click(screen.getByRole('button',{name:'Выбрать Дуэль'}));expect(change).toHaveBeenCalledWith(1);
 view.rerender(<CityGamePanel entries={entries} activeIndex={1} onActiveIndexChange={change}/>);
 expect(screen.getByRole('button',{name:'Выбрать Дуэль'})).toHaveAttribute('aria-pressed','true');
 expect(screen.getByRole('button',{name:'Выбрать Ежедневная игра'})).toHaveAttribute('aria-pressed','false');
});
it('hides navigation dots for a single entry',()=>{
 render(<CityGamePanel entries={[entries[0]!]} activeIndex={0} onActiveIndexChange={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Развернуть игры'}));
 expect(screen.queryByRole('group',{name:'Вкладки игр'})).toBeNull();
 expect(screen.queryByText('1 / 1')).toBeNull();
});
