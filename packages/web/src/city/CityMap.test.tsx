import {render,screen,fireEvent} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {CityMap} from './CityMap.js';
const base={owner:'test',daily:'12/90 бросков сегодня',training:'4/100 бросков',tasks:'Награды: 8/53 · Уровни: 34/280',bonus:'Пройдено: 40/50',onNavigate:vi.fn()};
it('moves daily action according to player status and keeps training in yard',()=>{
 const v=render(<CityMap {...base} level="amateur"/>);
 expect(screen.getByRole('button',{name:'Войти на стадион'})).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Выбрать Дворовый каток'}));
 expect(screen.queryByRole('button',{name:'Ежедневная игра'})).toBeNull();
 expect(screen.getByText('Открытая тренировка и упражнения')).toBeVisible();
 v.unmount();sessionStorage.clear();render(<CityMap {...base} level="professional"/>);
 expect(screen.getByRole('heading',{name:'Арена Ультимейт'})).toBeVisible();
 expect(screen.getByRole('button',{name:'Войти на арену'})).toBeVisible();
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

it('removes the phone circle from the dock',()=>{
 sessionStorage.clear();render(<CityMap {...base} level="beginner"/>);
 const dock=screen.getByRole('navigation',{name:'Места района'});
 expect(Array.from(dock.querySelectorAll('button')).filter(button=>button.getAttribute('aria-label')!=='Выбрать Раздевалка').slice(1,6).map(b=>b.getAttribute('aria-label'))).toEqual(['Выбрать Дворовый каток','Выбрать Магазин','Выбрать Задания','Выбрать Банк','Выбрать Стадион «Центральный»']);
});

function mapGeometry(){
 const viewport=screen.getByLabelText('Карта района');
 const world=viewport.firstElementChild as HTMLElement;
 Object.defineProperty(viewport,'clientWidth',{configurable:true,value:400});
 Object.defineProperty(world,'clientWidth',{configurable:true,value:3000});
 const scroll=vi.fn();viewport.scrollTo=scroll;
 return {viewport,scroll};
}
it('opens the bank immediately even when its map object is off center',()=>{
 sessionStorage.clear();base.onNavigate.mockClear();render(<CityMap {...base} level="beginner"/>);
 const {viewport}=mapGeometry();viewport.scrollLeft=500;
 fireEvent.click(screen.getByRole('button',{name:'На карте: Банк'}));
 expect(base.onNavigate).toHaveBeenCalledTimes(1);
 expect(base.onNavigate).toHaveBeenCalledWith('/inventory?tab=bank');
 expect(sessionStorage.getItem('city-place-v2:test:beginner')).toBe('bank');
});
for(const [level,title,left] of [['beginner','Дворовый каток',181],['amateur','Стадион «Центральный»',1117],['professional','Арена Ультимейт',2410]] as const){
 it(`opens the centered daily venue for ${level}`,()=>{
  sessionStorage.clear();base.onNavigate.mockClear();render(<CityMap {...base} level={level}/>);
  const {viewport}=mapGeometry();viewport.scrollLeft=left;
  fireEvent.click(screen.getByRole('button',{name:`На карте: ${title}`}));
  expect(base.onNavigate).toHaveBeenCalledWith('/daily');
 });
}
it('keeps development buildings closed on both map and dock clicks',()=>{
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

it('puts profile first and opens it immediately regardless of map position',()=>{
 sessionStorage.clear();base.onNavigate.mockClear();render(<CityMap {...base} level="beginner"/>);
 expect(screen.getByRole('navigation',{name:'Места района'}).querySelector('button')).toHaveAttribute('aria-label','Открыть профиль');
 const {viewport}=mapGeometry();viewport.scrollLeft=500;
 fireEvent.click(screen.getByRole('button',{name:'Открыть профиль'}));
 expect(base.onNavigate).toHaveBeenCalledTimes(1);
 expect(base.onNavigate).toHaveBeenCalledWith('/profile');
 expect(sessionStorage.getItem('city-place-v2:test:beginner')).toBe('profile');
});
it('keeps the map booth without a dock circle',()=>{
 sessionStorage.clear();base.onNavigate.mockClear();render(<CityMap {...base} level="beginner"/>);
 expect(screen.queryByRole('button',{name:'Выбрать Телефонная будка'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'На карте: Телефонная будка'}));
 expect(base.onNavigate).toHaveBeenCalledWith('/chat');
 expect(sessionStorage.getItem('city-place-v2:test:beginner')).toBe('chat');
 expect(sessionStorage.getItem('chat-return-v1:test')).toBe('/sections');
});

it('shows live counters on their circles and removes zero badges',()=>{
 sessionStorage.clear();const view=render(<CityMap {...base} level="beginner" avatarUrl="/avatar.webp" chatCount={120} gameCount={3} taskCount={2} barCount={1}/>);
 expect(screen.getByLabelText('Дуэли и турниры: 3')).toHaveTextContent('3');
 expect(screen.getByLabelText('Задания и челленджи: 2')).toHaveTextContent('2');
 expect(screen.getByLabelText('Приглашения в бар: 1')).toHaveTextContent('1');
 expect(screen.getByRole('button',{name:'Открыть профиль'}).querySelector('img')).toHaveAttribute('src','/avatar.webp');
 view.rerender(<CityMap {...base} level="beginner" chatCount={0} gameCount={0} taskCount={0} barCount={0}/>);
 expect(screen.queryByLabelText('Непрочитанные: 120')).toBeNull();
 expect(document.querySelector('.district-badge')).toBeNull();
});
it('renders persisted weather on the actual city map without intercepting input',()=>{
 localStorage.setItem('city-weather-v1',JSON.stringify({weather:'fog',until:Date.now()+3_600_000,blizzardAt:Date.now()+6*24*3_600_000}));
 const view=render(<CityMap {...base} level="beginner"/>);
 expect(view.container.querySelector('[data-weather="fog"]')).not.toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Выбрать Магазин'}));
 expect(screen.getByRole('heading',{name:'Магазин'})).toBeVisible();
 view.unmount();localStorage.removeItem('city-weather-v1');
});
it('opens profile on the first apartment tap',()=>{
 sessionStorage.clear();base.onNavigate.mockClear();render(<CityMap {...base} level="beginner" avatarUrl="/avatar.webp"/>);
 mapGeometry();fireEvent.click(screen.getByRole('button',{name:'На карте: Моя квартира'}));
 expect(base.onNavigate).toHaveBeenCalledTimes(1);
 expect(base.onNavigate).toHaveBeenCalledWith('/profile');
});
it('does not open the apartment after a map swipe',()=>{
 sessionStorage.clear();base.onNavigate.mockClear();render(<CityMap {...base} level="beginner"/>);
 const {viewport}=mapGeometry();viewport.setPointerCapture=vi.fn();
 const pointer=(type:string,x:number)=>{const event=new MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:200});Object.defineProperties(event,{isPrimary:{value:true},pointerId:{value:1},pointerType:{value:'mouse'}});fireEvent(viewport,event);};
 pointer('pointerdown',200);pointer('pointermove',100);pointer('pointerup',100);
 fireEvent.click(screen.getByRole('button',{name:'На карте: Моя квартира'}),{detail:1});
 expect(base.onNavigate).not.toHaveBeenCalled();
});

for(const [level,id,name] of [['beginner','yard','Дворовый каток'],['amateur','stadium','Стадион «Центральный»'],['professional','pro','Арена Ультимейт']] as const){
 it(`anchors the game panel to the ${level} venue and starts home there`,()=>{
  sessionStorage.setItem(`city-place-v2:test:${level}`,'bank');
  const view=render(<CityMap {...base} level={level} startAtDaily gamePanel={<div>Game panel</div>}/>);
  expect(view.container.querySelector('.district-game-anchor')).toHaveAttribute('data-venue',id);
  const venue = screen.getByRole('button',{name:`На карте: ${name}`});
  expect((view.container.querySelector('.district-game-anchor') as HTMLElement).style.left).toBe(venue.style.left);
  expect(screen.getByRole('heading',{name})).toBeVisible();expect(view.container.querySelector('.district-world')).toContainElement(screen.getByText('Game panel'));
 });
}
for(const [level,name] of [['beginner','Дворовый каток'],['amateur','Стадион «Центральный»'],['professional','Арена Ультимейт']] as const){
 it(`shows the game timer only under the ${level} home venue and enters the section directly`,()=>{
  const open=vi.fn();const view=render(<CityMap {...base} level={level} gameStatus={{label:'04:59',urgent:true}} onOpenGamePanel={open}/>);
  expect(screen.getAllByLabelText('Статус игр: 04:59')).toHaveLength(1);
  const circle=screen.getByRole('button',{name:`Выбрать ${name}`});expect(circle).toContainElement(screen.getByLabelText('Статус игр: 04:59'));
  fireEvent.click(circle);expect(open).not.toHaveBeenCalled();expect(base.onNavigate).toHaveBeenCalledWith('/daily');
  view.rerender(<CityMap {...base} level={level} gameStatus={{label:null,urgent:false}} onOpenGamePanel={open}/>);expect(screen.queryByLabelText(/Статус игр:/)).not.toBeInTheDocument();
 });
}

it('only shows the admin shortcut for admins and preserves menu attention counters',()=>{
 const onNavigate=vi.fn();const view=render(<CityMap {...base} onNavigate={onNavigate} level="beginner"/>);
 expect(screen.queryByRole('button',{name:'Открыть админку'})).not.toBeInTheDocument();
 view.rerender(<CityMap {...base} onNavigate={onNavigate} level="beginner" isAdmin adminCount={120} referralCount={2}/>);
 const admin=screen.getByRole('button',{name:'Открыть админку'});
 expect(admin).toBe(screen.getByRole('navigation',{name:'Места района'}).lastElementChild);
 expect(admin.querySelector('svg')).toHaveClass('lucide-shield-check');
 expect(screen.getByLabelText('События администратора: 120')).toHaveTextContent('99+');
 expect(screen.getByLabelText('Награды за приглашения: 2')).toHaveTextContent('2');
 fireEvent.click(admin);expect(onNavigate).toHaveBeenCalledWith('/admin');
 view.rerender(<CityMap {...base} level="beginner" isAdmin adminCount={0}/>);
 expect(screen.queryByLabelText(/События администратора/)).not.toBeInTheDocument();
});

it('collapses the entire navigation into a map button and remembers it per player',()=>{
 localStorage.clear();sessionStorage.clear();
 const view=render(<CityMap {...base} level="beginner"/>);
 fireEvent.click(screen.getByRole('button',{name:'Выбрать Банк'}));
 fireEvent.click(screen.getByRole('button',{name:'Свернуть навигацию'}));
 expect(screen.queryByRole('navigation',{name:'Места района'})).toBeNull();
 expect(screen.queryByRole('heading',{name:'Банк'})).toBeNull();
 expect(screen.getByRole('button',{name:'Показать навигацию'})).toHaveAttribute('aria-expanded','false');
 view.unmount();
 const returned=render(<CityMap {...base} level="beginner"/>);
 expect(screen.getByRole('button',{name:'Показать навигацию'})).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Показать навигацию'}));
 expect(screen.getByRole('heading',{name:'Банк'})).toBeVisible();
 expect(screen.getByRole('navigation',{name:'Места района'})).toBeVisible();
 returned.unmount();
 render(<CityMap {...base} owner="another-player" level="beginner"/>);
 expect(screen.getByRole('navigation',{name:'Места района'})).toBeVisible();
 localStorage.clear();
});

it('keeps vehicle lights on at sunset and night, and off in daylight',()=>{
 vi.useFakeTimers();
 try{
  for(const hour of [12,19,23]){
   vi.setSystemTime(new Date(2026,9,18,hour));
   const view=render(<CityMap {...base} level="beginner"/>);
   expect(view.container.querySelector('.city-traffic')?.classList.contains('is-night')).toBe(hour!==12);
   view.unmount();
  }
 }finally{vi.useRealTimers();}
});

it('labels every map circle while keeping badges and full accessible place names',()=>{
 sessionStorage.clear();
 render(<CityMap {...base} level="beginner" isAdmin adminCount={2}/>);
 const dock=screen.getByRole('navigation',{name:'Места района'});
 const labels=Array.from(dock.querySelectorAll('.district-dock__label')).map(el=>el.textContent);
 expect(labels).toContain('Профиль');
 expect(labels).toContain('Магазин');
 expect(labels).toContain('Двор');
 expect(labels).toContain('Стадион');
 expect(labels).toContain('Арена');
 expect(labels).toContain('Админ');
 expect(screen.getByRole('button',{name:'Выбрать Стадион «Центральный»'})).toHaveTextContent('Стадион');
 expect(screen.getByLabelText('События администратора: 2')).toBeInTheDocument();
});

for(const [level,place,label,path] of [['beginner','Дворовый каток','Войти во двор','/daily'],['amateur','Стадион «Центральный»','Войти на стадион','/daily'],['professional','Арена Ультимейт','Войти на арену','/daily']] as const){
 it(`uses one entrance for ${place}`,()=>{
  sessionStorage.clear();base.onNavigate.mockClear();render(<CityMap {...base} level={level}/>);
  fireEvent.click(screen.getByRole('button',{name:`Выбрать ${place}`}));
  expect(document.querySelectorAll('.district-actions button')).toHaveLength(1);
  expect(screen.queryByRole('button',{name:'Ежедневная игра'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:label}));expect(base.onNavigate).toHaveBeenCalledWith(path);
 });
}

it('opens a dock section on one click after panning the map elsewhere',()=>{
 sessionStorage.clear();base.onNavigate.mockClear();render(<CityMap {...base} level="beginner"/>);
 const {viewport}=mapGeometry();viewport.scrollLeft=700;
 fireEvent.click(screen.getByRole('button',{name:'Выбрать Банк'}));
 expect(base.onNavigate).toHaveBeenCalledTimes(1);
 expect(base.onNavigate).toHaveBeenCalledWith('/inventory?tab=bank');
});

it.each(['beginner','amateur','professional'] as const)('keeps exactly one separate locker entry for %s',level=>{
 sessionStorage.clear();base.onNavigate.mockClear();render(<CityMap {...base} level={level}/>);
 expect(screen.getAllByRole('button',{name:'На карте: Раздевалка'})).toHaveLength(1);
 fireEvent.click(screen.getByRole('button',{name:'Выбрать Раздевалка'}));
 expect(screen.getByRole('heading',{name:'Раздевалка'})).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Открыть раздевалку'}));
 expect(base.onNavigate).toHaveBeenCalledWith('/locker-room');
});
it('moves the same locker marker with level and keeps restored selection usable',()=>{
 sessionStorage.clear();sessionStorage.setItem('city-place-v2:test:beginner','locker');
 const view=render(<CityMap {...base} level="beginner"/>);
 const marker=screen.getByRole('button',{name:'На карте: Раздевалка'});
 const first=marker.style.left;
 expect(screen.getByRole('heading',{name:'Раздевалка'})).toBeVisible();
 view.rerender(<CityMap {...base} level="amateur"/>);
 expect(marker.style.left).not.toBe(first);
 const second=marker.style.left;
 view.rerender(<CityMap {...base} level="professional"/>);
 expect(marker.style.left).not.toBe(second);
 expect(screen.getAllByRole('button',{name:'На карте: Раздевалка'})).toHaveLength(1);
});
it.each([['beginner','Дворовый каток'],['amateur','Стадион «Центральный»'],['professional','Арена Ультимейт']] as const)('places the locker immediately after the home venue for %s', (level,name)=>{
 const view=render(<CityMap {...base} level={level}/>);
 const labels=Array.from(view.container.querySelectorAll('.district-dock button')).map(button=>button.getAttribute('aria-label'));
 expect(labels[labels.indexOf(`Выбрать ${name}`)+1]).toBe('Выбрать Раздевалка');
});
it('places the amateur locker on the stadium facade instead of the street',()=>{
 render(<CityMap {...base} level="amateur"/>);
 expect(screen.getByRole('button',{name:'На карте: Раздевалка'})).toHaveStyle({left:'49%',top:'57%'});
});

it.each(['На карте: Банк','Выбрать Банк'])('opens %s on its first click and persists selection before leaving',label=>{
 sessionStorage.clear();
 const navigate=vi.fn(()=>expect(sessionStorage.getItem('city-place-v2:test:amateur')).toBe('bank'));
 const view=render(<CityMap {...base} onNavigate={navigate} level="amateur"/>);
 fireEvent.click(screen.getByRole('button',{name:label}));
 expect(navigate).toHaveBeenCalledTimes(1);
 expect(navigate).toHaveBeenCalledWith('/inventory?tab=bank');
 view.unmount();
 render(<CityMap {...base} level="amateur"/>);
 expect(screen.getByRole('heading',{name:'Банк'})).toBeVisible();
 expect(screen.getByRole('button',{name:'Выбрать Банк'})).toHaveAttribute('aria-pressed','true');
});

it('renders the profile glass directly over the map while retaining the apartment hit area',()=>{
 render(<CityMap {...base} level="beginner"/>);
 const hit=screen.getByRole('button',{name:'На карте: Моя квартира'});
 const marker=document.querySelector('.district-apartment-avatar');
 expect(marker?.parentElement).toBe(hit.parentElement);
 expect(hit).toHaveStyle({width:'4%',height:'9%'});
 expect(marker).toHaveStyle({left:'5.8%',top:'34.1%'});
});
