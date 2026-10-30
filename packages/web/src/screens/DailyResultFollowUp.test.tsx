import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { claimInitialTrainingInvitation } from '../api/initialTraining.js';
import type { DailyStateResponse } from '../api/duel.js';
import { DailyResultFollowUp } from './DailyResultFollowUp.js';
vi.mock('../api/initialTraining.js', () => ({ claimInitialTrainingInvitation: vi.fn() }));
const now = Date.parse('2026-10-30T12:00:00Z');
const state = {
  state: 'break_active', amateur_qualifying_goals: 42, amateur_unlock_goals_required: 100,
  break_ends_at: '2026-10-30T12:15:00Z', recent_periods: [{ ended_at: '2026-10-30T12:00:00Z' }],
} as DailyStateResponse;
function renderFollowUp(snapshot = state, novice = true) {
  const onOpenCourse = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><DailyResultFollowUp state={snapshot} userId="player" novice={novice} now={now} onOpenCourse={onOpenCourse}/></QueryClientProvider>);
  return onOpenCourse;
}
beforeEach(() => { vi.mocked(claimInitialTrainingInvitation).mockReset().mockResolvedValue({ exercise: null }); });
it('shows confirmed qualification, a break timer and a voluntary link to the offered exercise', async () => {
  vi.mocked(claimInitialTrainingInvitation).mockResolvedValue({ exercise: { key: 'three-positions', title: 'Три позиции' } });
  const open = renderFollowUp();
  expect(screen.getByText('Путь в Любители')).toBeVisible();
  expect(screen.getByText('15:00')).toBeVisible();
  const button = await screen.findByRole('button', { name: 'Перейти к упражнению' });
  expect(open).not.toHaveBeenCalled();
  fireEvent.click(button);
  expect(open).toHaveBeenCalledWith('three-positions');
});
it.each(['period_active', 'closed'] as const)('never requests a course invitation in %s', async phase => {
  renderFollowUp({ ...state, state: phase });
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(claimInitialTrainingInvitation).not.toHaveBeenCalled();
});
it('does not request invitations after the amateur transition or after the break expires', () => {
  renderFollowUp({ ...state, break_ends_at: '2026-10-30T11:59:00Z' }, false);
  expect(claimInitialTrainingInvitation).not.toHaveBeenCalled();
  expect(screen.queryByText(/Путь в Любители/)).not.toBeInTheDocument();
});
it('keeps results usable when the optional invitation request fails', async () => {
  vi.mocked(claimInitialTrainingInvitation).mockRejectedValue(new Error('offline'));
  renderFollowUp();
  await waitFor(() => expect(claimInitialTrainingInvitation).toHaveBeenCalledTimes(1));
  expect(screen.getByText('осталось шайб: 58')).toBeVisible();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
