import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DriftGame } from './DriftGame.js';
import type { DriftSession } from '../api/drift.js';
const initial: DriftSession = {
  attemptId: 'test',
  seed: 'test',
  version: 7,
  seq: 0,
  progress: 0,
  completed: false,
  serverNow: '2026-10-31T12:00:00Z',
  readyAt: '2026-10-31T12:15:00Z',
  showInstruction: true,
};
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('shows one dismissible instruction and the original break timer', () => {
  render(<DriftGame initial={initial} onExit={() => {}} onComplete={() => {}} />);

  expect(screen.getByRole('dialog')).toHaveClass('bonus-game-launch-modal');
  expect(screen.getByText(/Убери весь снег/)).toBeInTheDocument();
  fireEvent.click(screen.getByText('Начать уборку'));
  expect(screen.queryByText('Начать уборку')).toBeNull();
});
it('ends immediately when the ordinary break has expired', async () => {
  const exit = vi.fn(),
    complete = vi.fn();
  render(
    <DriftGame
      initial={{ ...initial, readyAt: initial.serverNow, showInstruction:false }}
      onExit={exit}
      onComplete={complete}
    />,
  );
  await waitFor(() => expect(exit).toHaveBeenCalledOnce());
  expect(complete).not.toHaveBeenCalled();
});
it('blocks an incompatible physics version', () => {
  render(
    <DriftGame
      initial={{ ...initial, version: 999, showInstruction: false }}
      onExit={() => {}}
      onComplete={() => {}}
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('Обнови игру');
});

it('closes an already running game exactly when the remaining break expires', () => {
 let now=Date.parse(initial.serverNow);
 vi.spyOn(Date,'now').mockImplementation(()=>now);
 let frame: FrameRequestCallback = () => {};
 vi.spyOn(window,'requestAnimationFrame').mockImplementation(callback=>{frame=callback;return 1;});
 vi.spyOn(window,'cancelAnimationFrame').mockImplementation(()=>{});
 const exit=vi.fn(), complete=vi.fn();
 render(<DriftGame initial={{...initial,readyAt:new Date(now+1000).toISOString(),showInstruction:false}} onExit={exit} onComplete={complete}/>);
 expect(exit).not.toHaveBeenCalled();
 act(()=>{now+=1000;frame(performance.now());});
 expect(exit).toHaveBeenCalledOnce();
 expect(complete).not.toHaveBeenCalled();
});

it('shows the selected blizzard title, wind and delivery rules in the same launch card', () => {
 render(<DriftGame initial={{...initial,variant:'blizzard',version:2}} onExit={()=>{}} onComplete={()=>{}}/>);
 expect(screen.getByRole('heading',{name:'Григорий против метели'})).toBeInTheDocument();
 expect(screen.getByText(/сгоняй весь снег к борту/)).toBeInTheDocument();
 fireEvent.click(screen.getByText('Начать уборку'));
 expect(screen.getByLabelText('Направление ветра')).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Правила игры'})).toBeInTheDocument();
});

it('uses ventilation rules and title when the same game is played in the indoor stadium',()=>{
 render(<DriftGame venue="stadium" initial={{...initial,variant:'blizzard',version:2}} onExit={()=>{}} onComplete={()=>{}}/>);
 expect(screen.getByRole('heading',{name:'Сквозняк на арене'})).toBeInTheDocument();
 expect(screen.getByText(/На арене включили продувку/)).toBeInTheDocument();
 fireEvent.click(screen.getByText('Начать уборку'));
 expect(screen.getByLabelText('Направление продувки')).toBeInTheDocument();
});
it.each(['drift','blizzard'] as const)('shows the launch preview again for a returning %s player', variant => {
 render(<DriftGame initial={{...initial,variant,version:variant==='blizzard'?2:initial.version,showInstruction:false}} onExit={()=>{}} onComplete={()=>{}}/>);
 expect(screen.getByRole('dialog')).toHaveClass('bonus-game-launch-modal');
 fireEvent.click(screen.getByRole('button',{name:'Начать уборку'}));
 expect(screen.queryByRole('dialog')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Правила игры'}));
 expect(screen.getByRole('dialog')).toBeInTheDocument();
});
