import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BarAchievementsPreviewScreen } from './BarAchievementsPreviewScreen.js';
import { useAuthStore } from '../auth/authStore.js';
afterEach(() => {
  vi.unstubAllGlobals();
});
describe('bar achievement local preview', () => {
  it('switches access without authentication mutations or network requests', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const auth = useAuthStore.getState();
    render(
      <MemoryRouter initialEntries={['/dev/bar-achievements?level=beginner&filter=bar']}>
        <BarAchievementsPreviewScreen />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', {
          name: 'Неизвестное задание. Доступно со статуса Любитель',
        }),
      ).toHaveLength(25),
    );
    expect(
      screen.queryByRole('button', { name: 'Победы в шашки · Арсенич. Открыть подробности' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Любитель' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Победы в шашки · Арсенич. Открыть подробности' }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('button', { name: 'Неизвестное задание. Доступно со статуса Любитель' }),
    ).not.toBeInTheDocument();
    expect(useAuthStore.getState()).toBe(auth);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    ['С запасом · Онлайн', 'Победить с разницей ровно в 3 обычных шара.'],
    ['Фол не помеха · Вероника', 'Выиграть одну партию, допустив не менее 1 собственного фола.'],
  ])('uses the hockey details layout for %s', async (title, requirement) => {
    render(
      <MemoryRouter initialEntries={['/dev/bar-achievements?level=amateur&filter=bar']}>
        <BarAchievementsPreviewScreen />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: title + '. Открыть подробности' }));
    const modal = screen.getByRole('dialog');
    const details = within(modal);
    expect(modal).toHaveClass('achievement-details-modal');
    expect(details.getByText('Задание для уровня 1')).toBeInTheDocument();
    expect(details.getAllByText(requirement)).toHaveLength(1);
    expect(
      details.getByRole('progressbar', { name: 'Прогресс текущего уровня' }),
    ).toBeInTheDocument();
    expect(details.queryByLabelText('Все уровни задания')).not.toBeInTheDocument();
    expect(details.queryByText(/зв\. · .*опыта/)).not.toBeInTheDocument();
  });
  it('shows a single task without artificial level labels', async () => {
    render(
      <MemoryRouter initialEntries={['/dev/bar-achievements?level=amateur&filter=bar']}>
        <BarAchievementsPreviewScreen />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Всухую · Онлайн. Открыть подробности' }),
    );
    const details = within(screen.getByRole('dialog'));
    expect(details.getByText('Задание')).toBeInTheDocument();
    expect(details.queryByText(/Текущий уровень|Задание для уровня/)).not.toBeInTheDocument();
    expect(details.getByRole('progressbar', { name: 'Прогресс задания' })).toBeInTheDocument();
  });
});
