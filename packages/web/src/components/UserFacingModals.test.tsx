import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UserPickerModal } from '../chat/components/UserPickerModal.js';
import { AchievementDetailsSheet } from '../screens/profileSections.js';

function renderWithQuery(ui: JSX.Element): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('user-facing modal consistency', () => {
  it('opens player search through the shared accessible modal', () => {
    const onClose = vi.fn();
    renderWithQuery(<UserPickerModal open onClose={onClose} onPicked={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: 'Новый чат' });
    expect(dialog).toHaveClass('modal-card');
    expect(screen.queryByText('Введите имя для поиска')).not.toBeInTheDocument();
    expect(
      screen
        .getByRole('heading', { name: 'Новый чат' })
        .parentElement?.querySelector(':scope > button[aria-label="Закрыть"]'),
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('opens achievement details through the shared accessible modal', () => {
    const onClose = vi.fn();
    render(
      <AchievementDetailsSheet
        achievement={{
          id: 'achievement-1',
          title: 'Снайпер',
          description: 'Забросить много шайб.',
          requirement: 'Забросить 100 шайб',
          photoUrl: '/achievement.webp',
          isUnlocked: true,
          isClaimable: false,
        }}
        onClose={onClose}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Снайпер' });
    expect(dialog).toHaveClass('modal-card');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
