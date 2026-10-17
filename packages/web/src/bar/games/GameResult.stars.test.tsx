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
it('puts the final cumulative score below stars, including player-one orientation',()=>{
 const runtime=createMatch('ochko',0,0,true,1);
 if(runtime.game.kind!=='ochko'||!runtime.game.series)throw Error('Expected series');
 runtime.game.winner=1;runtime.game.series.totals=[21,56];runtime.game.scores=[3,11];
 runtime.game.series.history=([[4,14],[5,16],[6,15],[6,11]] as [number,number][]).map((awards,i)=>({round:i+1,awards,hands:[[],[]],challenged:false}));
 const view:BarGameSnapshot={id:'score',kind:'ochko',character:'grigory',player:1,participants:[{userId:'g',displayName:'Григорий',avatarUrl:null},{userId:'a',displayName:'Игрок',avatarUrl:null}],runtime,ready:null,serverNow:0,stake:{amount:2,payout:4}};
 render(<GameResult view={view} replay={()=>{}} back={()=>{}}/>);
 const stars=screen.getByLabelText('Изменение баланса звёзд'),score=screen.getByLabelText('Итоговый счёт');
 expect(score).toHaveTextContent('Счёт:');
 expect(score).toHaveTextContent('56 : 21');
 expect(score).toHaveTextContent('(14:4, 16:5, 15:6, 11:6)');
 expect(stars.compareDocumentPosition(score)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
