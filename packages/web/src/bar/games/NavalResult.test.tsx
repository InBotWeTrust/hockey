import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { barBattleship as sea, createMatch, publicRuntime, type BarGameSnapshot } from '@hockey/game-core';
import { NavalResult } from './NavalResult.js';
import { GameResult } from './GameModals.js';
afterEach(cleanup);
it.each([0, 1] as const)('expands the final enemy board with shots and submarine trail for player %i', player => {
  const enemy = player === 0 ? 1 : 0;
  const runtime = createMatch('battleship', enemy, 0, false, 4);
  let game = sea.start(runtime.game as unknown as sea.State);
  const destination = sea.moves(sea.view(game, enemy))[0]!;
  game = sea.move(game, enemy, destination.x, destination.y);
  game.shots[player] = [{ cell: 0, hit: false }];
  game.winner = player;
  runtime.game = game as unknown as sea.View;
  const view: BarGameSnapshot = {id:'naval-result',kind:'battleship',character:null,player,participants:[],runtime:publicRuntime(runtime,player),ready:null,serverNow:1000};
  render(<GameResult view={view} replay={()=>{}} back={()=>{}}/>);
  expect(screen.queryByRole('group', {name:'Расстановка соперника'})).toBeNull();
  fireEvent.click(screen.getByText('Посмотреть поле соперника'));
  expect(screen.getByRole('group', {name:'Расстановка соперника'})).toBeInTheDocument();
  expect(document.querySelectorAll('.bar-naval-review .bar-naval-vessel:not(.bar-naval-vessel--trail)')).toHaveLength(12);
  expect(document.querySelector('.bar-naval-vessel--trail')).toHaveTextContent('1');
  expect(document.querySelectorAll('.bar-naval-review .bar-naval-miss')).toHaveLength(1);
});

it('shows the actual partial placement when a player leaves before the battle starts', () => {
 const game=sea.create(0,4);game.fleets[1]=[];game.winner=0;
 render(<NavalResult game={sea.view(game,0)} player={0}/>);
 fireEvent.click(screen.getByText('Посмотреть поле соперника'));
 expect(screen.getByText('Игра закончилась до завершения расстановки. Показаны размещённые корабли.')).toBeInTheDocument();
 expect(document.querySelectorAll('.bar-naval-review .bar-naval-vessel')).toHaveLength(0);
});
