import {render,screen,fireEvent} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {CityMap} from './CityMap.js';
const base={owner:'test',daily:'12/90 бросков сегодня',training:'4/100 бросков',tasks:'Награды: 8/53 · Уровни: 34/280',bonus:'Пройдено: 40/50',onNavigate:vi.fn()};
it('moves daily action according to player status and keeps training in yard',()=>{
 const v=render(<CityMap {...base} level="amateur"/>);
 expect(screen.getByRole('button',{name:'Ежедневная игра'})).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Выбрать Дворовый каток'}));
 expect(screen.queryByRole('button',{name:'Ежедневная игра'})).toBeNull();
 expect(screen.getByText('Открытая тренировка и упражнения')).toBeVisible();
 v.unmount();sessionStorage.clear();render(<CityMap {...base} level="professional"/>);
 expect(screen.getByRole('heading',{name:'Арена Ультимейт'})).toBeVisible();
 expect(screen.getByRole('button',{name:'Ежедневная игра'})).toBeVisible();
});
it('uses bank route, real progress and development placeholders',()=>{
 sessionStorage.clear();render(<CityMap {...base} level="beginner"/>);
 fireEvent.click(screen.getByRole('button',{name:'Выбрать Банк'}));fireEvent.click(screen.getByRole('button',{name:'Открыть банк'}));expect(base.onNavigate).toHaveBeenCalledWith('/inventory?tab=bank');
 fireEvent.click(screen.getByRole('button',{name:'Выбрать Задания'}));expect(screen.getByText(base.tasks)).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Выбрать Спортзал'}));expect(screen.getByText('Физическая подготовка · в разработке')).toBeVisible();expect(screen.queryByRole('button',{name:'Войти'})).toBeNull();
});

it('restores both scrollers instantly and animates a new selection without observer interruption',()=>{
 sessionStorage.clear();
 const scroll=vi.fn();const original=HTMLElement.prototype.scrollTo;
 HTMLElement.prototype.scrollTo=scroll;
 const previous=globalThis.ResizeObserver;
 globalThis.ResizeObserver=class {constructor(private cb:ResizeObserverCallback){} observe(target:Element){this.cb([{target} as ResizeObserverEntry],this as unknown as ResizeObserver);}unobserve(){}disconnect(){}} as typeof ResizeObserver;
 try{
  const view=render(<CityMap {...base} level="beginner"/>);
  expect(scroll.mock.calls.map(c=>c[0].behavior)).toEqual(['auto','auto']);
  scroll.mockClear();fireEvent.click(screen.getByRole('button',{name:'Выбрать Банк'}));
  expect(scroll.mock.calls.map(c=>c[0].behavior)).toEqual(['smooth','smooth']);
  view.unmount();scroll.mockClear();render(<CityMap {...base} level="beginner"/>);
  expect(scroll.mock.calls.map(c=>c[0].behavior)).toEqual(['auto','auto']);
 }finally{HTMLElement.prototype.scrollTo=original;globalThis.ResizeObserver=previous;}
});

it('orders the dock as yard, shop, tasks, bank and stadium',()=>{
 sessionStorage.clear();render(<CityMap {...base} level="beginner"/>);
 const dock=screen.getByRole('navigation',{name:'Места района'});
 expect(Array.from(dock.querySelectorAll('button')).slice(1,6).map(b=>b.getAttribute('aria-label'))).toEqual(['Выбрать Дворовый каток','Выбрать Магазин','Выбрать Задания','Выбрать Банк','Выбрать Стадион «Центральный»']);
});

function mapGeometry(){
 const viewport=screen.getByLabelText('Карта района');
 const world=viewport.firstElementChild as HTMLElement;
 Object.defineProperty(viewport,'clientWidth',{configurable:true,value:400});
 Object.defineProperty(world,'clientWidth',{configurable:true,value:3000});
 const scroll=vi.fn();viewport.scrollTo=scroll;
 return {viewport,scroll};
}
it('selects and centers first, recenters an off-center selection, then opens the centered bank',()=>{
 sessionStorage.clear();base.onNavigate.mockClear();render(<CityMap {...base} level="beginner"/>);
 const {viewport,scroll}=mapGeometry();const bank=screen.getByRole('button',{name:'На карте: Банк'});
 fireEvent.click(bank);expect(base.onNavigate).not.toHaveBeenCalled();
 expect(screen.getByRole('heading',{name:'Банк'})).toBeVisible();
 scroll.mockClear();fireEvent.click(bank);
 expect(base.onNavigate).not.toHaveBeenCalled();expect(scroll).toHaveBeenCalled();
 viewport.scrollLeft=886;fireEvent.click(bank);
 expect(base.onNavigate).toHaveBeenCalledWith('/inventory?tab=bank');
});
for(const [level,title,left] of [['beginner','Дворовый каток',181],['amateur','Стадион «Центральный»',1144],['professional','Арена Ультимейт',2410]] as const){
 it(`opens the centered daily venue for ${level}`,()=>{
  sessionStorage.clear();base.onNavigate.mockClear();render(<CityMap {...base} level={level}/>);
  const {viewport}=mapGeometry();viewport.scrollLeft=left;
  fireEvent.click(screen.getByRole('button',{name:`На карте: ${title}`}));
  expect(base.onNavigate).toHaveBeenCalledWith('/daily');
 });
}
it('keeps development buildings closed and dock taps as selection only',()=>{
 sessionStorage.clear();base.onNavigate.mockClear();render(<CityMap {...base} level="beginner"/>);
 const {viewport}=mapGeometry();
 fireEvent.click(screen.getByRole('button',{name:'Выбрать Спортзал'}));viewport.scrollLeft=1375;
 fireEvent.click(screen.getByRole('button',{name:'На карте: Спортзал'}));
 fireEvent.click(screen.getByRole('button',{name:'Выбрать Спортзал'}));
 expect(base.onNavigate).not.toHaveBeenCalled();
});
it('does not open a centered building after a swipe',()=>{
 sessionStorage.clear();base.onNavigate.mockClear();render(<CityMap {...base} level="beginner"/>);
 const {viewport}=mapGeometry();viewport.scrollLeft=181;
 const pointer=(type:string,x:number)=>{const event=new Event(type,{bubbles:true});Object.defineProperties(event,{isPrimary:{value:true},button:{value:0},clientX:{value:x},clientY:{value:300},pointerType:{value:'touch'}});fireEvent(viewport,event);};
 pointer('pointerdown',200);pointer('pointermove',170);pointer('pointerup',170);
 fireEvent.click(screen.getByRole('button',{name:'На карте: Дворовый каток'}),{detail:1});
 expect(base.onNavigate).not.toHaveBeenCalled();
});

it('puts profile first and opens it directly',()=>{
 sessionStorage.clear();base.onNavigate.mockClear();render(<CityMap {...base} level="beginner"/>);
 const dock=screen.getByRole('navigation',{name:'Места района'});
 expect(dock.querySelector('button')).toHaveAttribute('aria-label','Открыть профиль');
 fireEvent.click(screen.getByRole('button',{name:'Открыть профиль'}));
 expect(base.onNavigate).toHaveBeenCalledWith('/profile');
});
it('opens chat directly from the phone booth while its circle only selects',()=>{
 sessionStorage.clear();base.onNavigate.mockClear();render(<CityMap {...base} level="beginner"/>);
 mapGeometry();
 fireEvent.click(screen.getByRole('button',{name:'Выбрать Телефонная будка'}));
 expect(base.onNavigate).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'На карте: Телефонная будка'}));
 expect(base.onNavigate).toHaveBeenCalledWith('/chat');
});

it('shows live counters on their circles and removes zero badges',()=>{
 sessionStorage.clear();const view=render(<CityMap {...base} level="beginner" avatarUrl="/avatar.webp" chatCount={120} gameCount={3} taskCount={2} barCount={1}/>);
 expect(screen.getByLabelText('Непрочитанные: 120')).toHaveTextContent('99+');
 expect(screen.getByLabelText('Дуэли и турниры: 3')).toHaveTextContent('3');
 expect(screen.getByLabelText('Задания и челленджи: 2')).toHaveTextContent('2');
 expect(screen.getByLabelText('Приглашения в бар: 1')).toHaveTextContent('1');
 expect(screen.getByRole('button',{name:'Открыть профиль'}).querySelector('img')).toHaveAttribute('src','/avatar.webp');
 view.rerender(<CityMap {...base} level="beginner" chatCount={0} gameCount={0} taskCount={0} barCount={0}/>);
 expect(screen.queryByLabelText('Непрочитанные: 120')).toBeNull();
 expect(document.querySelector('.district-badge')).toBeNull();
});
