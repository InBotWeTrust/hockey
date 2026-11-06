import {render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {CityMap} from './CityMap.js';
import {GameMenuProvider} from './GameMenuContext.js';

it('matches new building centers and keeps the arena behind foreground hit areas',()=>{
 render(<GameMenuProvider><CityMap level="beginner" owner="layout-check" daily="" training="" tasks="" bonus="" onNavigate={vi.fn()}/></GameMenuProvider>);
 const shop=screen.getByRole('button',{name:'На карте: Магазин'});
 expect(shop.style.left).toBe('28.428%');
 expect(shop.style.top).toBe('60.304%');
 const arena=screen.getByRole('button',{name:'На карте: Арена Ультимейт'});
 const fame=screen.getByRole('button',{name:'На карте: Зал славы'});
 expect(Number(arena.style.zIndex)).toBeLessThan(Number(fame.style.zIndex));
 expect(screen.getByRole('button',{name:'На карте: Раздевалка'})).toHaveStyle({left:'21.47%',top:'59.44%'});
});

it('uses the latest moved arena, task building and phone booth',()=>{
 render(<GameMenuProvider><CityMap level="beginner" daily="" training="" tasks="" bonus="" onNavigate={vi.fn()}/></GameMenuProvider>);
 expect(screen.getByRole('button',{name:'На карте: Арена Ультимейт'})).toHaveStyle({left:'88.63%',top:'40.573%'});
 expect(screen.getByRole('button',{name:'На карте: Задания'})).toHaveStyle({left:'39.866%',top:'60.958%'});
 expect(screen.getByRole('button',{name:'На карте: Лента'})).toHaveStyle({left:'20.006%',top:'48.145%'});
});
