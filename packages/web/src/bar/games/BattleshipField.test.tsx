import { render, screen, fireEvent } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { barBattleship as sea } from '@hockey/game-core';
import { BattleshipField } from './BattleshipField.js';
it('selects a cell before sending a confirmed shot and never exposes a live enemy ship', () => {
  const game = sea.view(sea.start(sea.create(0, 4)), 0),
    send = vi.fn();
  render(<BattleshipField game={game} player={0} disabled={false} locked={false} send={send} />);
  const board = screen.getByRole('group', { name: 'Поле противника' });
  const cells = board.querySelectorAll('button');
  expect(board.querySelectorAll('[data-ship="true"]')).toHaveLength(0);
  fireEvent.click(cells[15]!);
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));
  expect(send).toHaveBeenCalledWith({
    type: 'naval-attack',
    x: 3,
    y: 1,
    salvo: false,
    vertical: false,
  });
});
it('locks all fleet changes after readiness', () => {
  const send = vi.fn();
  render(
    <BattleshipField game={sea.view(sea.create(0, 4), 0)} player={0} disabled locked send={send} />,
  );
  expect(screen.queryByRole('button', { name: 'Случайно' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('group', { name: 'Твой флот' }).querySelector('button')!);
  expect(send).not.toHaveBeenCalled();
});
it('highlights legal submarine maneuvers and confirms one separately', () => {
  const game = sea.view(sea.start(sea.create(0, 4)), 0),
    send = vi.fn();
  render(<BattleshipField game={game} player={0} disabled={false} locked={false} send={send} />);
  fireEvent.click(screen.getByRole('button', { name: 'Мой флот' }));
  const sub = game.ownShips.find((s) => s.kind === 'submarine')!;
  fireEvent.click(
    screen.getByRole('group', { name: 'Твой флот' }).querySelectorAll('button')[
      sub.y * 12 + sub.x
    ]!,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Манёвр Осталось 2' }));
  const dest = sea.moves(game)[0]!;
  const board = screen.getByRole('group', { name: 'Твой флот' });
  expect(board.querySelectorAll('[data-maneuver="true"]').length).toBeGreaterThan(0);
  fireEvent.click(board.querySelectorAll('button')[dest.y * 12 + dest.x]!);
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));
  expect(send).toHaveBeenCalledWith({ type: 'naval-move', ...dest });
});
it('blocks fleet edits while a preparation command is pending', () => {
  const send = vi.fn();
  render(
    <BattleshipField
      game={sea.view(sea.create(0, 4), 0)}
      player={0}
      disabled
      locked={false}
      send={send}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Случайно' })).not.toBeInTheDocument();
});
it('labels all twelve columns and rows around the playable grid', () => {
  const { container } = render(
    <BattleshipField
      game={sea.view(sea.start(sea.create(0, 4)), 0)}
      player={0}
      disabled={false}
      locked={false}
      send={() => {}}
    />,
  );
  expect(container.querySelector('.bar-naval-columns')?.textContent).toBe('АБВГДЕЖЗИКЛМ');
  expect(container.querySelector('.bar-naval-rows')?.children).toHaveLength(12);
  expect(
    screen.getByRole('group', { name: 'Поле противника' }).querySelectorAll('button'),
  ).toHaveLength(144);
});
it('disables attacks on the own board and enables maneuver only for a selected submarine', () => {
  const game = sea.view(sea.start(sea.create(0, 4)), 0);
  render(
    <BattleshipField game={game} player={0} disabled={false} locked={false} send={() => {}} />,
  );
  const own = screen.getByRole('button', { name: 'Мой флот' }),
    enemy = screen.getByRole('button', { name: 'Противник' });
  expect(enemy).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(own);
  expect(own).toHaveAttribute('aria-pressed', 'true');
  expect(enemy).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: 'Выстрел' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Залп' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Манёвр Осталось 2' })).toBeDisabled();
  const sub = game.ownShips.find((s) => s.kind === 'submarine')!;
  fireEvent.click(
    screen.getByRole('group', { name: 'Твой флот' }).querySelectorAll('button')[
      sub.y * 12 + sub.x
    ]!,
  );
  expect(screen.getByRole('button', { name: 'Манёвр Осталось 2' })).toBeEnabled();
  fireEvent.click(enemy);
  expect(screen.getByRole('button', { name: 'Манёвр Осталось 2' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Выстрел' })).toBeEnabled();
});
it('keeps an invalid placement selected and explains why rotation is blocked', () => {
  const game = sea.view(sea.create(0, 4), 0),
    send = vi.fn(),
    onHint = vi.fn();
  render(
    <BattleshipField
      game={game}
      player={0}
      disabled={false}
      locked={false}
      send={send}
      onHint={onHint}
    />,
  );
  const ship = game.ownShips.find((s) => s.kind === 'carrier')!;
  const buttons = screen.getByRole('group', { name: 'Твой флот' }).querySelectorAll('button');
  fireEvent.click(buttons[ship.y * 12 + ship.x]!);
  fireEvent.click(buttons[143]!);
  expect(send).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Повернуть корабль' })).toBeEnabled();
  expect(onHint).toHaveBeenLastCalledWith(expect.stringContaining('Корабли'));
});
it('hides rotation when the selected ship cannot turn in its current position', () => {
 const game=sea.view(sea.create(0,4),0), send=vi.fn();
 const ship=game.ownShips.find(s=>s.w!==s.h&&!sea.validPlacement(game.ownShips.map(t=>t.id===s.id?{...t,w:t.h,h:t.w}:t)))!;
 render(<BattleshipField game={game} player={0} disabled={false} locked={false} send={send}/>);
 fireEvent.click(screen.getByRole('group',{name:'Твой флот'}).querySelectorAll('button')[ship.y*12+ship.x]!);
 expect(screen.queryByRole('button',{name:'Повернуть корабль'})).not.toBeInTheDocument();
 expect(send).not.toHaveBeenCalled();
});
it('preserves the grabbed cell, snaps invalid drops, and cancels without sending', () => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  const game = sea.view(sea.create(0, 4), 0), send = vi.fn();
  render(<BattleshipField game={game} player={0} disabled={false} locked={false} send={send} />);
  const board = screen.getByRole('group', {name:'Твой флот'});
  vi.spyOn(board,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:120,height:120,right:120,bottom:120,x:0,y:0,toJSON:()=>({})});
  Object.assign(board,{setPointerCapture:vi.fn()});
  const ship=game.ownShips.find(s=>s.kind==='carrier')!;
  const start={clientX:(ship.x+1)*10+5,clientY:ship.y*10+5,button:0};
  fireEvent.pointerDown(board,start);
  fireEvent.pointerMove(board,{clientX:5,clientY:5});
  expect(send).not.toHaveBeenCalled();
  expect(board.querySelector('[data-preview]')).not.toBeNull();
  fireEvent.pointerCancel(board);
  expect(send).not.toHaveBeenCalled();
  fireEvent.pointerDown(board,start);
  fireEvent.pointerMove(board,{clientX:15,clientY:5});
  fireEvent.pointerUp(board,{clientX:15,clientY:5});
  expect(send).toHaveBeenCalledTimes(1);
  const legal = Array.from({length:144},(_,i)=>({x:i%12,y:Math.floor(i/12)})).filter(p=>sea.validFleet(game.ownShips.map(s=>s.id===ship.id?{...s,...p}:s))).sort((a,b)=>(a.x*a.x+a.y*a.y)-(b.x*b.x+b.y*b.y));
  expect(send).toHaveBeenCalledWith({type:'naval-configure',shipId:ship.id,...legal[0],vertical:ship.h>ship.w});
  vi.unstubAllGlobals();
});
it('shows reserves on an empty board and deploys one selected ship', () => {
 const g=sea.create(0,4);g.fleets[0]=[];const send=vi.fn();
 const {rerender}=render(<BattleshipField game={sea.view(g,0)} player={0} disabled={false} locked={false} send={send}/>);
 expect(screen.getByRole('group',{name:'Твой флот'}).querySelector('[data-ship="true"]')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Авианосец ×1'}));
 expect(send).toHaveBeenCalledWith(expect.objectContaining({type:'naval-deploy',shipId:'carrier'}));
 const next=sea.deploy(g,0,'carrier',1);
 rerender(<BattleshipField game={sea.view(next,0)} player={0} disabled={false} locked={false} send={send}/>);
 expect(screen.getByRole('button',{name:'Авианосец ×0'})).toBeDisabled();
 expect(screen.getByRole('button',{name:'Повернуть корабль'})).toBeEnabled();
});
it('keeps only readiness below the board and does not mark anchor cells as available water', () => {
 const game=sea.view(sea.create(0,4),0);
 const {container}=render(<BattleshipField game={game} player={0} disabled={false} locked={false} send={()=>{}} readyAction={<button>Готов</button>}/>);
 fireEvent.click(screen.getByRole('group',{name:'Твой флот'}).querySelector('[data-ship="true"]')!);
 expect(container.querySelector('[data-maneuver="true"]')).toBeNull();
 expect(screen.queryByRole('button',{name:'Случайно'})).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:/^Повернуть$/})).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Повернуть корабль'})).toBeEnabled();
});
it('uses the same six ship color keys in the reserve and on both visible fleets without exposing live enemies', () => {
 const g=sea.create(0,4);const game=sea.view(g,0);
 const {container,rerender}=render(<BattleshipField game={game} player={0} disabled={false} locked={false} send={()=>{}}/>);
 const keys=Array.from(container.querySelectorAll('.bar-naval-reserve-ship')).map(e=>e.getAttribute('data-ship-color'));
 expect(new Set(keys).size).toBe(6);expect(keys).not.toContain(null);
 for(const ship of game.ownShips){const key=ship.kind==='standard'?`standard-${Math.max(ship.w,ship.h)}`:ship.kind;expect(container.querySelectorAll(`.bar-naval-cell[data-ship-color="${key}"]`).length).toBeGreaterThan(0);}
 const battle=sea.start(g);battle.fleets[1][0]!.hits=sea.cells(battle.fleets[1][0]!);
 rerender(<BattleshipField game={sea.view(battle,0)} player={0} disabled={false} locked={false} send={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Противник'}));
 expect(container.querySelectorAll('.bar-naval-cell[data-ship-color="carrier"]')).toHaveLength(6);
 expect(container.querySelectorAll('.bar-naval-cell[data-ship="true"]')).toHaveLength(6);
});
it('shows the own fleet for the opponent turn and impact, then returns to targeting', () => {
 const g=sea.start(sea.create(0,4)),send=vi.fn();
 const {rerender,container}=render(<BattleshipField game={sea.view(g,0)} player={0} disabled={false} locked={false} send={send} now={1000} animationStart={0}/>);
 const after=sea.attack(g,0,0,0,false,false);
 rerender(<BattleshipField game={sea.view(after,0)} player={0} disabled locked={false} send={send} now={2700} animationStart={1000}/>);
 expect(screen.getByRole('group',{name:'Твой флот'})).toBeInTheDocument();
 const miss=Array.from({length:144},(_,i)=>i).find(c=>!g.fleets[0].some(s=>sea.cells(s).includes(c)))!;
 const reply=sea.attack(after,1,miss%12,Math.floor(miss/12),false,false);
 rerender(<BattleshipField game={sea.view(reply,0)} player={0} disabled locked={false} send={send} now={2000} animationStart={2000}/>);
 expect(screen.getByRole('group',{name:'Твой флот'})).toBeInTheDocument();
 expect(container.querySelector('[data-impact="miss"]')).not.toBeNull();
 rerender(<BattleshipField game={sea.view(reply,0)} player={0} disabled={false} locked={false} send={send} now={3700} animationStart={2000}/>);
 expect(screen.getByRole('group',{name:'Поле противника'})).toBeInTheDocument();
 expect(container.querySelector('[data-impact]')).toBeNull();
});
it.each([0,1] as const)('shakes for player %i hits and shows a stronger impact for sinking', actor=>{
 const g=sea.start(sea.create(actor,4));const victim=g.fleets[1-actor]!.find(s=>s.w*s.h>1)!;
 const {container,rerender}=render(<BattleshipField game={sea.view(sea.attack(g,actor,victim.x,victim.y,false,false),0)} player={0} disabled locked={false} send={()=>{}} now={1000} animationStart={1000}/>);
 expect(container.querySelector('.bar-naval-grid--hit')).not.toBeNull();
 expect(container.querySelector('[data-impact="hit"]')).not.toBeNull();
 victim.hits=sea.cells(victim).slice(1);
 const sunk=sea.attack(g,actor,victim.x,victim.y,false,false);
 rerender(<BattleshipField game={sea.view(sunk,0)} player={0} disabled locked={false} send={()=>{}} now={2000} animationStart={2000}/>);
 expect(container.querySelector('.bar-naval-grid--sunk')).not.toBeNull();
 expect(container.querySelector('[data-impact="sunk"]')).not.toBeNull();
});
it('stays on the opponent board after a continuing hit and ignores a manual view from the previous action',()=>{
 const g=sea.start(sea.create(0,4)),ship=g.fleets[1][0]!;
 const {rerender}=render(<BattleshipField game={sea.view(g,0)} player={0} disabled={false} locked={false} send={()=>{}} now={1000} animationStart={0}/>);
 fireEvent.click(screen.getByRole('button',{name:'Мой флот'}));
 const hit=sea.attack(g,0,ship.x,ship.y,false,false);
 rerender(<BattleshipField game={sea.view(hit,0)} player={0} disabled={false} locked={false} send={()=>{}} now={2000} animationStart={2000}/>);
 expect(screen.getByRole('group',{name:'Поле противника'})).toBeInTheDocument();
 rerender(<BattleshipField game={sea.view(hit,0)} player={0} disabled={false} locked={false} send={()=>{}} now={3601} animationStart={2000}/>);
 expect(screen.getByRole('group',{name:'Поле противника'})).toBeInTheDocument();
});
it('marks every sunk cell with a cross while keeping partial damage round',()=>{
 const g=sea.start(sea.create(0,4));const sunk=g.fleets[0][0]!,damaged=g.fleets[0][1]!;
 sunk.hits=sea.cells(sunk);damaged.hits=[sea.cells(damaged)[0]!];
 const {container}=render(<BattleshipField game={sea.view(g,0)} player={0} disabled={false} locked={false} send={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Мой флот'}));
 expect(container.querySelectorAll('.bar-naval-damage--sunk')).toHaveLength(6);
 expect(container.querySelectorAll('.bar-naval-damage:not(.bar-naval-damage--sunk)')).toHaveLength(1);
});
it('shows a charging airstrike and offers directional submarine controls before confirmation', () => {
  const game=sea.view(sea.start(sea.create(0,4,true)),0), send=vi.fn();
  render(<BattleshipField game={game} player={0} disabled={false} locked={false} send={send}/>);
  expect(screen.getByRole('button',{name:'Авианалёт Заряд 0%'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Мой флот'}));
  const sub=game.ownShips.find(s=>s.kind==='submarine')!;
  fireEvent.click(screen.getByRole('group',{name:'Твой флот'}).querySelectorAll('.bar-naval-cell')[sub.y*12+sub.x]!);
  expect(screen.getAllByRole('button',{name:/Переместить подлодку/})).toHaveLength(sea.moves(game).length);
  fireEvent.click(screen.getAllByRole('button',{name:/Переместить подлодку/})[0]!);
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Подтвердить'}));
  expect(send).toHaveBeenCalledWith({type:'naval-move',...sea.moves(game)[0]!});
});
it('marks only water bordering sunk ships without recording shots or hiding live neighbors', () => {
 const state=sea.start(sea.create(0,4,true));
 const destroyed=state.fleets[1].find(s=>s.kind==='standard'&&s.w*s.h===2)!;
 destroyed.hits=sea.cells(destroyed);
 const wounded=state.fleets[1].find(s=>s.kind==='standard'&&s.w*s.h===3)!;
 wounded.hits=[sea.cells(wounded)[0]!];
 const game=sea.view(state,0),before=JSON.stringify(game),send=vi.fn();
 render(<BattleshipField game={game} player={0} disabled={false} locked={false} send={send}/>);
 const board=screen.getByRole('group',{name:'Поле противника'});
 const expected:number[]=[];
 for(let y=Math.max(0,destroyed.y-1);y<=Math.min(11,destroyed.y+destroyed.h);y++)
  for(let x=Math.max(0,destroyed.x-1);x<=Math.min(11,destroyed.x+destroyed.w);x++)
   if(!sea.cells(destroyed).includes(sea.cell(x,y)))expected.push(sea.cell(x,y));
 expect(board.querySelectorAll('[data-inferred-water="true"]')).toHaveLength(expected.length);
 for(const c of expected)expect(board.querySelectorAll('.bar-naval-cell')[c]).toHaveAttribute('data-inferred-water','true');
 expect(board.querySelectorAll('.bar-naval-cell')[sea.cells(wounded)[1]!]).not.toHaveAttribute('data-inferred-water','true');
 expect(JSON.stringify(game)).toBe(before);
});
it('explains the top-left anchor when selecting a charged airstrike',()=>{
 const state=sea.start(sea.create(0,4,true));state.airstrikeCharges=[5,0];
 const onHint=vi.fn(),send=vi.fn();
 render(<BattleshipField game={sea.view(state,0)} player={0} disabled={false} locked={false} send={send} onHint={onHint}/>);
 fireEvent.click(screen.getByRole('button',{name:'Авианалёт Заряд 100%'}));
 expect(onHint).toHaveBeenCalledWith('Выбери верхний левый угол области 2×2');
 expect(send).not.toHaveBeenCalled();
});
it('switches battle boards by horizontal swipe without selecting a target or sending a move',()=>{
 const send=vi.fn();
 render(<BattleshipField game={sea.view(sea.start(sea.create(0,4,true)),0)} player={0} disabled={false} locked={false} send={send}/>);
 let board=screen.getByRole('group',{name:'Поле противника'});
 fireEvent.touchStart(board,{touches:[{clientX:50,clientY:100}]});
 fireEvent.touchEnd(board,{changedTouches:[{clientX:160,clientY:110}]});
 board=screen.getByRole('group',{name:'Твой флот'});
 fireEvent.click(board.querySelectorAll('.bar-naval-cell')[10]!);
 expect(screen.getByRole('button',{name:'Подтвердить'})).toBeDisabled();
 fireEvent.touchStart(board,{touches:[{clientX:160,clientY:100}]});
 fireEvent.touchEnd(board,{changedTouches:[{clientX:50,clientY:110}]});
 expect(screen.getByRole('group',{name:'Поле противника'})).toBeInTheDocument();
 expect(send).not.toHaveBeenCalled();
});
it('ignores vertical swipes and does not switch boards during setup',()=>{
 const {rerender}=render(<BattleshipField game={sea.view(sea.start(sea.create(0,4,true)),0)} player={0} disabled={false} locked={false} send={vi.fn()}/>);
 let board=screen.getByRole('group',{name:'Поле противника'});
 fireEvent.touchStart(board,{touches:[{clientX:50,clientY:100}]});
 fireEvent.touchEnd(board,{changedTouches:[{clientX:60,clientY:200}]});
 expect(screen.getByRole('group',{name:'Поле противника'})).toBeInTheDocument();
 rerender(<BattleshipField game={sea.view(sea.create(0,4,true),0)} player={0} disabled={false} locked={false} send={vi.fn()}/>);
 board=screen.getByRole('group',{name:'Твой флот'});
 fireEvent.touchStart(board,{touches:[{clientX:150,clientY:100}]});
 fireEvent.touchEnd(board,{changedTouches:[{clientX:10,clientY:100}]});
 expect(screen.getByRole('group',{name:'Твой флот'})).toBeInTheDocument();
});
it('labels structurally disabled airstrikes and damaged-submarine maneuvers unavailable',()=>{
 const state=sea.start(sea.create(0,4,true));state.airstrikeCharges=[5,0];
 const carrier=state.fleets[0].find(s=>s.kind==='carrier')!;
 carrier.hits=sea.cells(carrier);
 const sub=state.fleets[0].find(s=>s.kind==='submarine')!;
 sub.hits=[sea.cells(sub)[0]!];
 render(<BattleshipField game={sea.view(state,0)} player={0} disabled={false} locked={false} send={vi.fn()}/>);
 expect(screen.getByRole('button',{name:'Авианалёт Недоступен'})).toBeDisabled();
 expect(screen.getByRole('button',{name:'Манёвр Недоступен'})).toBeDisabled();
});

it('keeps unavailable airstrikes unfilled as charge changes',()=>{
 const state=sea.start(sea.create(0,4,true));
 const carrier=state.fleets[0].find(s=>s.kind==='carrier')!;
 carrier.hits=sea.cells(carrier);
 const props={player:0 as const,disabled:false,locked:false,send:vi.fn()};
 const {rerender}=render(<BattleshipField {...props} game={sea.view(state,0)}/>);
 for(const charge of [1,3,5]) {
  state.airstrikeCharges=[charge,0];
  rerender(<BattleshipField {...props} game={sea.view(state,0)}/>);
  const action=screen.getByRole('button',{name:'Авианалёт Недоступен'});
  expect(action).toBeDisabled();
  expect(action.style.getPropertyValue('--charge')).toBe('0%');
 }
 carrier.hits=[];
 state.airstrikeCharges=[3,0];
 rerender(<BattleshipField {...props} game={sea.view(state,0)}/>);
 expect(screen.getByRole('button',{name:'Авианалёт Заряд 60%'}).style.getPropertyValue('--charge')).toBe('60%');
});

it.each([0,1] as const)('uses stronger airstrike shake and burning damage for actor %i', actor => {
 const g=sea.start(sea.create(actor,4,true));g.airstrikeCharges![actor]=5;
 const victim=g.fleets[1-actor]!.find(s=>s.kind==='carrier')!;
 const hit=sea.attack(g,actor,Math.min(victim.x,10),Math.min(victim.y,10),true,false);
 const {container}=render(<BattleshipField game={sea.view(hit,0)} player={0} disabled locked={false} send={()=>{}} now={1350} animationStart={1000}/>);
 expect(container.querySelector('.bar-naval-grid--airstrike')).not.toBeNull();
 expect(container.querySelector('.bar-naval-damage--burning')).not.toBeNull();
});
it('shows the opponent remaining submarine moves and removes the exhausted counter',()=>{
 const game=sea.view(sea.start(sea.create(0,4)),0);
 const {rerender}=render(<BattleshipField game={game} player={0} disabled={false} locked={false} send={()=>{}}/>);
 expect(screen.getByLabelText('Манёвров соперника осталось: 2')).toBeInTheDocument();
 rerender(<BattleshipField game={{...game,enemyMovesLeft:0}} player={0} disabled={false} locked={false} send={()=>{}}/>);
 expect(screen.queryByLabelText(/Манёвров соперника осталось/)).toBeNull();
});
it('offers board-wide escape for a damaged modern submarine and renders its abandoned fire smaller',()=>{
 const g=sea.start(sea.create(0,4,true,true));const sub=g.fleets[0].find(s=>s.kind==='submarine')!;sub.hits=[sea.cells(sub)[0]!];g.shots[1]=[{cell:sub.hits[0]!,hit:true}];
 const send=vi.fn();const {container,rerender}=render(<BattleshipField game={sea.view(g,0)} player={0} disabled={false} locked={false} send={send}/>);
 fireEvent.click(screen.getByRole('button',{name:'Мой флот'}));
 const board=screen.getByRole('group',{name:'Твой флот'});
 fireEvent.click(board.querySelectorAll('button')[sea.cells(sub)[1]!]!);
 expect(screen.getByRole('button',{name:'Манёвр Осталось 2'})).toBeEnabled();
 expect(container.querySelectorAll('.bar-naval-move-arrow')).toHaveLength(0);
 const destination=sea.moves(sea.view(g,0)).find(p=>Math.abs(p.x-sub.x)+Math.abs(p.y-sub.y)>3)!;
 fireEvent.click(board.querySelectorAll('button')[sea.cell(destination.x,destination.y)]!);
 fireEvent.click(screen.getByRole('button',{name:'Подтвердить'}));
 expect(send).toHaveBeenCalledWith({type:'naval-move',...destination});
 const moved=sea.move(g,0,destination.x,destination.y);
 rerender(<BattleshipField game={sea.view(moved,0)} player={0} disabled locked={false} send={send}/>);
 expect(container.querySelector('.bar-naval-damage--abandoned')).not.toBeNull();
});
it('uses filled dots around sunk ships in new-rule matches',()=>{
 const game=sea.start(sea.create(0,4,true,true));const victim=game.fleets[1].find(s=>s.w*s.h===1)!;
 const hit=sea.attack(game,0,victim.x,victim.y,false,false);
 const {container}=render(<BattleshipField game={sea.view(hit,0)} player={0} disabled={false} locked={false} send={()=>{}}/>);
 expect(container.querySelector('.bar-naval-water')).toBeNull();
 expect(container.querySelectorAll('.bar-naval-miss')).toHaveLength(sea.surroundingWater([victim]).length);
});

it('shows both submarine sections in the fleet row without exposing an enemy hit before escape',()=>{
 const game=sea.start(sea.create(0,4,true,true));const sub=game.fleets[0].find(s=>s.kind==='submarine')!;sub.hits=[sea.cells(sub)[0]!];
 const {rerender}=render(<BattleshipField game={sea.view(game,0)} player={0} disabled={false} locked={false} send={()=>{}}/>);
 expect(document.querySelectorAll('.bar-naval-sub-part')).toHaveLength(2);
 rerender(<BattleshipField game={sea.view(game,1)} player={1} disabled={false} locked={false} send={()=>{}}/>);
 expect(document.querySelector('.bar-naval-sub-parts')).toBeNull();
 const target=sea.moves(sea.view(game,0))[0]!;const escaped=sea.move(game,0,target.x,target.y);
 rerender(<BattleshipField game={sea.view(escaped,1)} player={1} disabled={false} locked={false} send={()=>{}}/>);
 expect(document.querySelectorAll('.bar-naval-sub-part')).toHaveLength(2);
 expect(document.querySelector('.bar-naval-sub-part[data-damaged="true"] .bar-naval-damage--burning')).not.toBeNull();
});

it('does not advertise an initial enemy maneuver in rescue-only matches',()=>{
 const game=sea.start(sea.create(0,4,true,true,true));
 render(<BattleshipField game={sea.view(game,0)} player={0} disabled={false} locked={false} send={()=>{}}/>);
 expect(screen.getByRole('button',{name:'Манёвр Недоступен'})).toBeDisabled();
 expect(screen.queryByLabelText(/Манёвров соперника осталось/)).toBeNull();
});
it.each([0,1] as const)('reveals airstrike cells one by one for actor %i during the impact scene',actor=>{
 const game=sea.start(sea.create(actor,4,true,true));game.airstrikeCharges![actor]=5;
 game.fleets[1-actor]=[{id:'ship-8',kind:'standard',x:10,y:10,w:1,h:1,hits:[]}];
 const {container,rerender}=render(<BattleshipField game={sea.view(game,0)} player={0} disabled locked={false} send={()=>{}} now={1000}/>);
 const hit=sea.attack(game,actor,0,0,true,false);
 for(const [elapsed,count] of [[0,1],[249,1],[250,2],[500,3],[750,4]]){
  rerender(<BattleshipField game={sea.view(hit,0)} player={0} disabled locked={false} send={()=>{}} now={2000+elapsed!} animationStart={2000}/>);
  expect(container.querySelectorAll('.bar-naval-miss')).toHaveLength(count!);
 }
});
it('keeps the later bomb cells hidden even when an earlier bomb sinks a ship beside them',()=>{
 const game=sea.start(sea.create(0,4,true,true));game.airstrikeCharges![0]=5;
 game.fleets[1]=[{id:'ship-4',kind:'standard',x:0,y:0,w:2,h:1,hits:[]}];
 const {rerender}=render(<BattleshipField game={sea.view(game,0)} player={0} disabled locked={false} send={()=>{}} now={1000}/>);
 const hit=sea.attack(game,0,0,0,true,false);
 rerender(<BattleshipField game={sea.view(hit,0)} player={0} disabled locked={false} send={()=>{}} now={2250} animationStart={2000}/>);
 const board=screen.getByRole('group',{name:'Поле противника'});
 expect(board.querySelectorAll('button')[12]!.querySelector('.bar-naval-miss')).toBeNull();
 rerender(<BattleshipField game={sea.view(hit,0)} player={0} disabled locked={false} send={()=>{}} now={2500} animationStart={2000}/>);
 expect(board.querySelectorAll('button')[12]!.querySelector('.bar-naval-miss')).not.toBeNull();
});
