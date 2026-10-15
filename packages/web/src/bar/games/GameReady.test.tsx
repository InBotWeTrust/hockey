import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createMatch, type BarGameId, type BarGameSnapshot } from '@hockey/game-core';
import { GameTable } from './BarGameScreen.js';
afterEach(cleanup);
function snapshot(kind: BarGameId, players: (0 | 1)[] = [], startsAt: number | null = null): BarGameSnapshot {
  return { id: 'ready', kind, character: null, player: 0,
    participants: [{userId:'a',displayName:'Игрок',avatarUrl:null},{userId:'b',displayName:'Соперник',avatarUrl:null}],
    runtime:createMatch(kind,0,0,false,1), serverNow:0,
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
