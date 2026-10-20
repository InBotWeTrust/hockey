import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { createMatch } from '@hockey/game-core';
import { BarGameScreen } from './BarGameScreen.js';
const scenario = vi.hoisted(() => ({ kind: 'checkers' as 'checkers' | 'darts' | 'billiards', error: null as string | null, retry: vi.fn(), send: vi.fn(), paused: false, character: 'arsenich' as string | null }));
afterEach(() => { cleanup(); scenario.error = null; scenario.paused = false; scenario.character = 'arsenich'; scenario.send.mockClear(); });
vi.mock('./useGameMatch.js', () => ({
  useGameMatch: () => ({
    view: {
      id: 'layout',
      kind: scenario.kind,
      character: scenario.character,
      rulesPaused: scenario.paused,
      player: 0,
      participants: [
        { userId: 'player', displayName: 'Игрок', avatarUrl: null },
        { userId: 'arsenich', displayName: 'Арсенич', avatarUrl: null },
      ],
      runtime: createMatch(scenario.kind, 0, Date.now(), true, 12),
      ready: null,
    },
    now: Date.now(),
    error: scenario.error,
    uncertain: !!scenario.error,
    retry: scenario.retry,
    busy: false,
    send: scenario.send,
  }),
}));
it('places checkers controls in the notice row without a title', () => {
  scenario.kind = 'checkers';
  render(
    <MemoryRouter>
      <BarGameScreen />
    </MemoryRouter>,
  );
  for (const name of ['Выйти из партии', 'Правила игры']) {
    expect(screen.getByRole('button', { name }).closest('.bar-game-notice-row')).not.toBeNull();
  }
  expect(screen.queryByRole('heading', { name: 'Шашки' })).not.toBeInTheDocument();
});

it('removes the darts title and renders controls outside its throwing area', () => {
  scenario.kind = 'darts';
  render(
    <MemoryRouter>
      <BarGameScreen />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('heading', { name: 'Дартс' })).not.toBeInTheDocument();
  for (const name of ['Выйти из партии', 'Правила игры']) {
    const button = screen.getByRole('button', { name });
    expect(button.closest('.bar-darts-field')).toBeNull();
    expect(button.closest('.bar-game-notice-row')).not.toBeNull();
  }
});

it.each(['checkers', 'darts', 'billiards'] as const)('shows %s sync failures inside the notice with retry', kind => {
 scenario.kind=kind; scenario.error='Не удалось подтвердить ход';
 render(<MemoryRouter><BarGameScreen/></MemoryRouter>);
 const alert=screen.getByRole('alert');
 expect(alert.closest('.bar-game-notice-row')).not.toBeNull();
 expect(document.querySelector('.bar-game-error')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Повторить отправку'}));
 expect(scenario.retry).toHaveBeenCalled();
});

it('opens character rules only after the server confirms pause and resumes on close', () => {
 scenario.kind='checkers';
 const {rerender}=render(<MemoryRouter><BarGameScreen/></MemoryRouter>);
 fireEvent.click(screen.getByRole('button',{name:'Правила игры'}));
 expect(scenario.send).toHaveBeenCalledWith({type:'rules-pause',paused:true});
 expect(screen.queryByRole('dialog')).toBeNull();
 scenario.paused=true;rerender(<MemoryRouter><BarGameScreen/></MemoryRouter>);
 expect(screen.getByRole('dialog')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Закрыть'}));
 expect(scenario.send).toHaveBeenCalledWith({type:'rules-pause',paused:false});
 expect(screen.getByRole('dialog')).toBeInTheDocument();
 scenario.paused=false;rerender(<MemoryRouter><BarGameScreen/></MemoryRouter>);
 expect(screen.queryByRole('dialog')).toBeNull();
});
it('opens online rules without pausing the match',()=>{
 scenario.kind='checkers';scenario.character=null;
 render(<MemoryRouter><BarGameScreen/></MemoryRouter>);
 fireEvent.click(screen.getByRole('button',{name:'Правила игры'}));
 expect(screen.getByRole('dialog')).toBeInTheDocument();expect(scenario.send).not.toHaveBeenCalled();
});
