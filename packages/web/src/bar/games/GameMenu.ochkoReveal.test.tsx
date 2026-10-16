import {render,screen} from '@testing-library/react';
import {it,expect} from 'vitest';
import {createMatch,type BarGameSnapshot} from '@hockey/game-core';
import {GameMenu} from './GameMenu.js';
it('does not announce the result until the opponent reveal has finished',()=>{
 const runtime=createMatch('ochko',0,0,true,1);
 if(runtime.game.kind!=='ochko')throw new Error('Expected ochko');
 runtime.game.winner=0;runtime.game.dealUntil=[0,0];
 const view:BarGameSnapshot={id:'reveal',kind:'ochko',character:'grigory',player:0,participants:[{userId:'a',displayName:'Игрок',avatarUrl:null},{userId:'grigory',displayName:'Григорий',avatarUrl:null}],runtime,ready:null,serverNow:1000};
 const {rerender}=render(<GameMenu view={view} now={1000}/>);
 expect(screen.getByRole('status')).not.toHaveTextContent('Партия завершена');
 rerender(<GameMenu view={view} now={2599}/>);
 expect(screen.getByRole('status')).not.toHaveTextContent('Партия завершена');
 rerender(<GameMenu view={view} now={2600}/>);
 expect(screen.getByRole('status')).toHaveTextContent('Партия завершена');
});
