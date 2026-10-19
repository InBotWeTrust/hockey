import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { apiFetch } from '../api/apiFetch.js';
import { fetchReferralSummary } from '../api/referrals.js';
import { referralSummary } from '../section-preview/apartmentFixtures.js';
import { ProfileFriendsScreen } from './ProfileFriendsScreen.js';
vi.mock('./ReferralsScreen.js', () => ({ ReferralsScreen: ({ embedded }: { embedded?: boolean }) => <section aria-label="Реферальная страница">{embedded ? 'Встроенные приглашения' : 'Отдельная страница'}</section> }));
vi.mock('../api/apiFetch.js', () => ({ apiFetch: vi.fn() }));
vi.mock('../api/referrals.js', () => ({ fetchReferralSummary: vi.fn() }));
vi.mock('../social/SocialProfile.js', () => ({
  SocialConnections: ({ userId }: { userId: string }) => (
    <section aria-label="Социальные связи">{userId}</section>
  ),
}));
function mount() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<ProfileFriendsScreen />} />
          <Route path="/referrals" element={<p>Приглашения</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiFetch).mockResolvedValue({ id: 'owner' });
  vi.mocked(fetchReferralSummary).mockResolvedValue({
    ...referralSummary,
    unclaimedRewardsCount: 2,
  });
});
it('uses existing social controls and keeps invitations inside friends', async () => {
  mount();
  expect(await screen.findByRole('region', { name: 'Социальные связи' })).toHaveTextContent(
    'owner',
  );
  expect(await screen.findByLabelText('Требуется действие')).toBeVisible();
  fireEvent.click(screen.getByRole('tab', { name: /Приглашения/ }));
  expect(screen.getByRole('region', { name: 'Реферальная страница' })).toHaveTextContent('Встроенные приглашения');
  expect(screen.queryByRole('region', { name: 'Социальные связи' })).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: 'Мой круг' }));
  expect(screen.getByRole('region', { name: 'Социальные связи' })).toBeVisible();
});
it('offers profile retry without inventing people or counts', async () => {
  vi.mocked(apiFetch).mockRejectedValueOnce(new Error('offline'));
  mount();
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить профиль');
  expect(screen.queryByRole('region', { name: 'Социальные связи' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  expect(await screen.findByRole('region', { name: 'Социальные связи' })).toBeVisible();
});
it('keeps invitations accessible when the badge query fails', async () => {
  vi.mocked(fetchReferralSummary).mockRejectedValueOnce(new Error('offline'));
  mount();
  await screen.findByRole('region', { name: 'Социальные связи' });
  fireEvent.click(screen.getByRole('tab', { name: 'Приглашения' }));
  expect(screen.getByRole('region', { name: 'Реферальная страница' })).toBeVisible();
});
