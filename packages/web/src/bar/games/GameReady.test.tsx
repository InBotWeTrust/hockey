import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createMatch, publicRuntime, type BarGameId, type BarGameSnapshot } from '@hockey/game-core';
import { GameTable } from './BarGameScreen.js';
afterEach(cleanup);
function snapshot(kind: BarGameId, players: (0 | 1)[] = [], startsAt: number | null = null): BarGameSnapshot {
  return { id: 'ready', kind, character: null, player: 0,
    participants: [{userId:'a',displayName:'Игрок',avatarUrl:null},{userId:'b',displayName:'Соперник',avatarUrl:null}],
    runtime:kind==='battleship'?publicRuntime(createMatch(kind,0,0,false,1),0):createMatch(kind,0,0,false,1), serverNow:0,
    ready:{players,startsAt,expiresAt:60000,cancelled:false} };
}
it.each(['darts','checkers','billiards'] as const)('confirms readiness on the %s field',kind=>{
  const send=vi.fn();
  render(<GameTable view={snapshot(kind)} now={0} disabled={false} send={send}/>);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('status')).toHaveTextContent('Ждём соперника');
  fireEvent.click(screen.getByRole('button',{name:'Готов'}));
  expect(send).toHaveBeenCalledWith({type:'ready'});
  expect(screen.queryByRole('slider',{name:'Сила удара'})).toBeNull();
  expect(screen.queryByRole('button',{name:'Выбрать точку удара'})).toBeNull();
});
it('reports opponent readiness before local confirmation',()=>{
 render(<GameTable view={snapshot('billiards',[1])} now={0} disabled={false} send={()=>{}}/>);
 expect(screen.getByRole('status')).toHaveTextContent('Соперник готов');
 expect(screen.getByRole('button',{name:'Готов'})).toBeEnabled();
});
it('waits after local confirmation and counts down from five after both',()=>{
 const {rerender}=render(<GameTable view={snapshot('billiards',[0])} now={0} disabled={false} send={()=>{}}/>);
 expect(screen.getByRole('status')).toHaveTextContent('Ждём соперника');
 expect(screen.getByRole('button',{name:'Вы готовы'})).toBeDisabled();
 rerender(<GameTable view={snapshot('billiards',[0,1],5000)} now={0} disabled={false} send={()=>{}}/>);
 expect(screen.getByRole('status')).toHaveTextContent('Начинаем через 5');
 expect(screen.queryByRole('button',{name:'Готов'})).toBeNull();
});
it('keeps naval placement instructions in the shared notice and readiness under the opponent name',()=>{
 render(<GameTable view={snapshot('battleship',[1])} now={0} disabled={false} send={()=>{}}/>);
 expect(screen.getByRole('status')).toHaveTextContent('Выбери корабль сверху и расставь весь флот');expect(screen.queryByText('Соперник готов')).not.toBeInTheDocument();expect(screen.getByText('Готов',{selector:'.bar-game-ready-label'})).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Случайно'})).not.toBeInTheDocument();
});
it('shows a persistent ninety-second naval setup clock in the menu',()=>{
 const v=snapshot('battleship',[1]);v.ready!.expiresAt=90000;
 const {rerender}=render(<GameTable view={v} now={0} disabled={false} send={()=>{}}/>);
 expect(screen.getByRole('timer')).toHaveTextContent('1:30');
 expect(screen.getByRole('timer')).toHaveTextContent('Расстановка');
 rerender(<GameTable view={v} now={17000} disabled={false} send={()=>{}}/>);
 expect(screen.getByRole('timer')).toHaveTextContent('1:13');
});
it.each(['darts','checkers','billiards','ochko','armwrestling','battleship'] as const)('shows confirmed readiness under both names in %s',kind=>{
 const {container,rerender}=render(<GameTable view={snapshot(kind,[0,1])} now={0} disabled={false} send={()=>{}}/>);
 expect(container.querySelectorAll('.bar-game-ready-label')).toHaveLength(2);
 rerender(<GameTable view={snapshot(kind,[])} now={0} disabled={false} send={()=>{}}/>);
 expect(container.querySelectorAll('.bar-game-ready-label')).toHaveLength(0);
});
it('keeps battle controls visible but disabled throughout the naval launch countdown',()=>{
 const {container,rerender}=render(<GameTable view={snapshot('battleship',[0,1],5000)} now={1000} disabled={false} send={()=>{}}/>);
 expect(container.querySelector('.bar-naval-reserve')).toBeNull();
 for(const name of ['Мой флот','Противник','Выстрел','Авианалёт Заряд 0%','Манёвр Недоступен','Подтвердить']) expect(screen.getByRole('button',{name})).toBeDisabled();
 const v=snapshot('battleship');v.ready=null;
 if(v.runtime.game.kind==='battleship')v.runtime.game.phase='battle';
 rerender(<GameTable view={v} now={5001} disabled={false} send={()=>{}}/>);
 expect(screen.getByRole('button',{name:'Выстрел'})).toBeEnabled();
});
it.each([null,'grigory'] as const)('keeps ochko cards and totals off the table until readiness finishes (%s)',character=>{
 const v=snapshot('ochko');v.character=character;
 const send=vi.fn();
 const {container,rerender}=render(<GameTable view={v} now={0} disabled={false} send={send}/>);
 for(const players of [[],[0],[1],[0,1]] as (0|1)[][]){
  v.ready={...v.ready!,players,startsAt:players.length===2?5000:null};
  rerender(<GameTable view={v} now={1000} disabled={false} send={send}/>);
  expect(container.querySelectorAll('.bar-ochko-card')).toHaveLength(0);
  expect(container.querySelector('.bar-ochko-sum')).toBeNull();
  expect(screen.queryByRole('button',{name:'Ещё карту'})).not.toBeInTheDocument();
 }
 v.ready=null;
 rerender(<GameTable view={v} now={5001} disabled={false} send={send}/>);
 expect(container.querySelectorAll('.bar-ochko-card')).toHaveLength(4);
 expect(screen.queryByRole('button',{name:'Готов'})).not.toBeInTheDocument();
 expect(send).not.toHaveBeenCalled();
});
