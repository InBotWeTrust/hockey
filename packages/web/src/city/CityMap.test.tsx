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
 expect(Array.from(dock.querySelectorAll('button')).slice(0,5).map(b=>b.getAttribute('aria-label'))).toEqual(['Выбрать Дворовый каток','Выбрать Магазин','Выбрать Задания','Выбрать Банк','Выбрать Стадион «Центральный»']);
});
