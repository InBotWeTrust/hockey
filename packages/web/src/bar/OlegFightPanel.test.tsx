import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { createFightState, DEFAULT_FIGHT_RULES } from '@hockey/game-core';
import { OlegFightPanel } from './OlegFightPanel.js';
import { commandOlegFight, fetchOlegFight, type OlegSnapshot } from './olegFightApi.js';
vi.mock('./olegFightApi.js', () => ({
  fetchOlegFight: vi.fn(),
  commandOlegFight: vi.fn(),
  acknowledgeOlegFight: vi.fn(),
}));
vi.mock('../game/fight/FightView.js', () => ({
  FightView: ({ onAttack }: { onAttack: () => void }) => (
    <button onClick={onAttack}>Attack fixture</button>
  ),
}));
const snapshot = (id: string): OlegSnapshot => ({
  id,
  state: createFightState(DEFAULT_FIGHT_RULES, Date.now()),
  serverNow: Date.now(),
  outcome: null,
  nextSeq: 1,
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchOlegFight).mockImplementation(async (id) => snapshot(id));
});
it('isolates queued commands and errors when the fight ID changes', async () => {
  let fail!: (error: Error) => void;
  vi.mocked(commandOlegFight)
    .mockImplementationOnce(
      () =>
        new Promise((_done, reject) => {
          fail = reject;
        }),
    )
    .mockImplementation(async (id) => snapshot(id));
  const view = render(<OlegFightPanel id="old" onDone={() => {}} />);
  fireEvent.click(await screen.findByText('Attack fixture'));
  await waitFor(() => expect(commandOlegFight).toHaveBeenCalledTimes(1));
  view.rerender(<OlegFightPanel id="new" onDone={() => {}} />);
  await waitFor(() => expect(fetchOlegFight).toHaveBeenCalledWith('new'));
  await act(async () => {});
  fireEvent.click(screen.getByText('Attack fixture'));
  await waitFor(() => expect(commandOlegFight).toHaveBeenCalledWith('new', expect.anything()));
  await act(async () => {
    fail(new Error('old connection failed'));
  });
  expect(screen.queryByText('Связь прервалась. Восстанавливаем драку…')).not.toBeInTheDocument();
  expect(vi.mocked(commandOlegFight).mock.calls.filter((call) => call[0] === 'old')).toHaveLength(
    1,
  );
});
it('retries a command with the same action ID and sequence after a network failure', async () => {
  vi.mocked(commandOlegFight)
    .mockRejectedValueOnce(new Error('offline'))
    .mockImplementation(async (id) => snapshot(id));
  render(<OlegFightPanel id="one" onDone={() => {}} />);
  fireEvent.click(await screen.findByText('Attack fixture'));
  await waitFor(() => expect(commandOlegFight).toHaveBeenCalledTimes(2));
  expect(vi.mocked(commandOlegFight).mock.calls[1]).toEqual(
    vi.mocked(commandOlegFight).mock.calls[0],
  );
});
