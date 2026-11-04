import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useCaretakerBreak } from './useCaretakerBreak.js';
import type { DriftSession } from '../api/drift.js';
import type { DailyStateResponse } from '../api/duel.js';
const api = vi.hoisted(() => ({ start: vi.fn(), hint: vi.fn(), result: {} as DriftSession }));
vi.mock('../api/caretaker.js', () => ({ caretakerHint: api.hint }));
vi.mock('../api/drift.js', () => ({ startDrift: api.start, sendDrift: vi.fn() }));
vi.mock('./DriftGame.js', () => ({ DriftGame: ({ onComplete, onExit }: { onComplete: (result: DriftSession) => void; onExit: () => void }) => <div aria-label="Лёд в заносе"><button onClick={()=>onComplete(api.result)}>Завершить уборку</button><button onClick={onExit}>Выйти из уборки</button></div> }));
const base = {
  day_date: '2026-10-31',
  current_period: 1,
  state: 'break_active',
} as DailyStateResponse;
function Harness({
  data = base,
  owner = 'a',
  suppressed = false,
}: {
  data?: DailyStateResponse;
  owner?: string;
  suppressed?: boolean;
}) {
  const caretaker = useCaretakerBreak(data, suppressed, () => {}, owner);
  return (
    <>
      <button onClick={caretaker.onTap} disabled={!caretaker.onTap}>
        Григорий
      </button>
      <span>{caretaker.completed ? 'Убран' : 'На льду'}</span>
      {caretaker.overlay}{caretaker.invitation}
    </>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  api.hint.mockResolvedValue({ show: true });
  api.result={attemptId:'a',seed:'test',version:2,seq:1,progress:100,completed:true,showInstruction:false,serverNow:new Date().toISOString(),readyAt:new Date(Date.now()+120000).toISOString()};
  api.start.mockResolvedValue({
    id: 'a',
    attemptId: 'a',
    seed: 'test',
    version: 2,
    period: 1,
    seq: 0,
    progress: 0,
    target: 20,
    startedAt: new Date().toISOString(),
    serverNow: new Date().toISOString(),
    readyAt: new Date(Date.now() + 900000).toISOString(),
    completed: false,
  });
});
it('closes a running task when the break ends', async () => {
  const view = render(<Harness />);
  fireEvent.click(screen.getByText('Григорий'));
  expect(await screen.findByLabelText('Лёд в заносе')).toBeVisible();
  view.rerender(<Harness data={{ ...base, state: 'idle' }} />);
  await waitFor(() => expect(screen.queryByLabelText('Лёд в заносе')).toBeNull());
  view.rerender(<Harness data={{ ...base, current_period: 2, state: 'period_active' }} />);
  await waitFor(() => expect(screen.queryByLabelText('Лёд в заносе')).toBeNull());
});
it('hides interaction while results are open', () => {
  render(<Harness suppressed />);
  expect(screen.getByText('Григорий')).toBeDisabled();
  expect(api.hint).not.toHaveBeenCalled();
});
it('does not show a late start response after changing accounts', async () => {
  let resolve!: (value: unknown) => void;
  api.start.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const view = render(<Harness />);
  fireEvent.click(screen.getByText('Григорий'));
  view.rerender(<Harness owner="b" />);
  resolve({ kind: 'push' });
  await waitFor(() => expect(screen.queryByLabelText('Лёд в заносе')).toBeNull());
});

it('hides the caretaker after success until a new break', async () => {
 const view = render(<Harness />);
 fireEvent.click(screen.getByText('Григорий'));
 fireEvent.click(await screen.findByText('Завершить уборку'));
 fireEvent.click(await screen.findByRole('button',{name:'Отлично'}));
 expect(screen.getByText('Убран')).toBeInTheDocument();
 expect(screen.getByText('Григорий')).toBeDisabled();
 view.unmount();
 const resumed = render(<Harness />);
 expect(screen.getByText('Убран')).toBeInTheDocument();
 resumed.rerender(<Harness data={{...base, current_period: 2}} />);
 expect(screen.getByText('На льду')).toBeInTheDocument();
 expect(screen.getByText('Григорий')).not.toBeDisabled();
});

it('keeps the break invitation visible after the first introduction', async () => {
 api.hint.mockResolvedValue({show:false});
 render(<Harness/>);
 expect(await screen.findByText('Нажми на Григория – помоги убрать лёд и сократи перерыв.')).toBeVisible();
});

it('shows the saved time and remaining break after a confirmed success',async()=>{
 render(<Harness/>);
 fireEvent.click(screen.getByText('Григорий'));
 fireEvent.click(await screen.findByText('Завершить уборку'));
 expect(await screen.findByRole('dialog',{name:'Лёд готов!'})).toHaveTextContent('Перерыв сокращён на:13 мин');
 expect(screen.getByText('2:00')).toBeInTheDocument();
});
it('offers the next period when a successful game ends the break',async()=>{
 api.result={...api.result,readyAt:api.result.serverNow};
 render(<Harness/>);
 fireEvent.click(screen.getByText('Григорий'));
 fireEvent.click(await screen.findByText('Завершить уборку'));
 expect(await screen.findByRole('dialog',{name:'Лёд готов!'})).toHaveTextContent('Можно начинать следующий период.');
 fireEvent.click(screen.getByRole('button',{name:'На лёд'}));
 expect(screen.queryByRole('dialog')).toBeNull();
 expect(screen.getByText('Григорий')).toBeDisabled();
});
