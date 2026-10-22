import {render,screen,fireEvent} from '@testing-library/react';
import {it,expect,vi} from 'vitest';
import {createMatch,publicRuntime,type BarGameSnapshot} from '@hockey/game-core';
import {GameMenu} from './GameMenu.js';
it.each(['darts','billiards','battleship','armwrestling','checkers','ochko'] as const)('offers surrender without a separate back button during %s',kind=>{
 const runtime=publicRuntime(createMatch(kind,0,0,false,1),0,1000);
 const view:BarGameSnapshot={id:'match',kind,character:null,player:0,participants:[{userId:'a',displayName:'Игрок',avatarUrl:null},{userId:'b',displayName:'Соперник',avatarUrl:null}],runtime,ready:null,serverNow:1000};
 const exit=vi.fn();render(<GameMenu view={view} now={1000} onExit={exit}/>);
 expect(screen.queryByRole('button',{name:'Назад'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Выйти из партии'}));expect(exit).toHaveBeenCalledOnce();
});
