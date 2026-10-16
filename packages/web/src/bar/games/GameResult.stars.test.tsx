import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,it,expect} from 'vitest';
import {createMatch,type BarGameSnapshot} from '@hockey/game-core';
import {GameResult} from './GameModals.js';
afterEach(cleanup);
it.each([[40,'+20'],[20,'0'],[0,'−20']] as const)('shows net stars for payout %s below the reply', (payout,expected)=>{
 const view:BarGameSnapshot={id:'paid',kind:'ochko',character:'grigory',player:0,participants:[{userId:'a',displayName:'Игрок',avatarUrl:null},{userId:'grigory',displayName:'Григорий',avatarUrl:null}],runtime:createMatch('ochko',0,0,true,1),ready:null,serverNow:1000,stake:{amount:20,payout}};
 view.runtime.game.winner=payout===40?0:payout===20?'draw':1;
 render(<GameResult view={view} replay={()=>{}} back={()=>{}}/>);
 if(payout===20){expect(screen.queryByLabelText('Изменение баланса звёзд')).not.toBeInTheDocument();return;}
 expect(screen.getByLabelText('Изменение баланса звёзд')).toHaveTextContent(expected);
 expect(screen.getByLabelText('Изменение баланса звёзд')).toHaveAttribute('data-loss',String(payout<20));
});
