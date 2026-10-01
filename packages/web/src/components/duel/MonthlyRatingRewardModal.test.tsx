import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MonthlyRatingRewardModal } from './MonthlyRatingRewardModal.js';

const acknowledgement = {
  id: '00000000-0000-4000-8000-000000000801',
  season_key: '2026-08',
  place: 1,
  matches_played: 46,
  eligible_count: 72,
  rewarded_count: 14,
  coins: 15000,
  stars: 300,
  tokens: 10,
  created_at: '2026-09-01T00:00:00.000Z',
};

describe('MonthlyRatingRewardModal', () => {
  it.each([
    [1, 'Вы стали победителем общего зачёта дуэлей за\u00a0август'],
    [2, 'Вы заняли 2-е место в общем зачёте дуэлей за\u00a0август'],
    [17, 'Вы заняли 17-е место в общем зачёте дуэлей за\u00a0август'],
  ])('shows the exact Russian title for place %i', (place, title) => {
    render(
      <MonthlyRatingRewardModal
        congratulation={{ ...acknowledgement, place }}
        pending={false}
        error={null}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: title })).toBeInTheDocument();
  });

  it('formats the YYYY-MM season without converting it through the browser timezone', () => {
    render(
      <MonthlyRatingRewardModal
        congratulation={acknowledgement}
        pending={false}
        error={null}
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('dialog', {
        name: 'Вы стали победителем общего зачёта дуэлей за\u00a0август',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Август 2026')).toBeNull();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('за\u00a0август');
  });

  it('renders every positive currency and hides zero-value rewards', () => {
    render(
      <MonthlyRatingRewardModal
        congratulation={{ ...acknowledgement, coins: 15000, stars: 300, tokens: 0 }}
        pending={false}
        error={null}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Монеты: 15000')).toBeInTheDocument();
    expect(screen.getByLabelText('Звёзды: 300')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Токены:/)).toBeNull();
  });

  it.each([
    [1, '1 очко'],
    [2, '2 очка'],
    [5, '5 очков'],
    [11, '11 очков'],
    [21, '21 очко'],
    [22, '22 очка'],
    [25, '25 очков'],
  ])('uses the correct Russian points form for %i', (points, expected) => {
    render(
      <MonthlyRatingRewardModal
        congratulation={{ ...acknowledgement, points }}
        pending={false}
        error={null}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText(new RegExp(`${expected}$`))).toBeInTheDocument();
  });

  it('labels format placements as other standings without a card container', () => {
    const { container } = render(
      <MonthlyRatingRewardModal
        congratulation={{
          ...acknowledgement,
          points: 999,
          awards: [
            {
              scope: 'overall',
              place: 1,
              points: 999,
              coins: 15_000,
              stars: 300,
              experience: 0,
              tokens: 10,
            },
            {
              scope: 'classic',
              place: 1,
              points: 42,
              coins: 0,
              stars: 30,
              experience: 30,
              tokens: 0,
            },
          ],
        }}
        pending={false}
        error={null}
        onConfirm={vi.fn()}
      />,
    );

    const otherStandingsTitle = screen.getByRole('heading', { name: 'Другие зачёты' });
    const rewardsTitle = screen.getByRole('heading', { name: 'Награды' });
    expect(otherStandingsTitle).toBeInTheDocument();
    expect(
      rewardsTitle.compareDocumentPosition(otherStandingsTitle)
      & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText('Классика:').closest('p')).toHaveTextContent(
      'Классика: 1-е место · 42 очка',
    );
    expect(container.querySelector('.monthly-rating-reward-modal__secondary-results')).toBeNull();
  });

  it('shows all positive currency rows with their shared reward colors', () => {
    render(
      <MonthlyRatingRewardModal
        congratulation={acknowledgement}
        pending={false}
        error={null}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Монеты: 15000')).toHaveStyle({ color: 'var(--reward-coin)' });
    expect(screen.getByLabelText('Звёзды: 300')).toHaveStyle({ color: 'var(--reward-star)' });
    expect(screen.getByLabelText('Токены: 10')).toHaveStyle({ color: 'var(--reward-token)' });
  });

  it('can only be dismissed by acknowledgement, not by Escape or its backdrop', () => {
    const onConfirm = vi.fn();
    render(
      <MonthlyRatingRewardModal
        congratulation={acknowledgement}
        pending={false}
        error={null}
        onConfirm={onConfirm}
      />,
    );

    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.mouseDown(document.querySelector('.modal-backdrop') as HTMLElement);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('keeps initial focus at the top so a tall modal does not open scrolled to the button', () => {
    render(
      <MonthlyRatingRewardModal
        congratulation={acknowledgement}
        pending={false}
        error={null}
        onConfirm={vi.fn()}
      />,
    );

    expect(document.activeElement).toHaveAttribute('data-monthly-rating-modal-start');
  });

  it('disables acknowledgement while the request is pending and keeps an errored acknowledgement visible', () => {
    const onConfirm = vi.fn();
    const { rerender } = render(
      <MonthlyRatingRewardModal
        congratulation={acknowledgement}
        pending
        error={null}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole('button', { name: 'Сохраняем…' })).toBeDisabled();
    rerender(
      <MonthlyRatingRewardModal
        congratulation={acknowledgement}
        pending={false}
        error="Не удалось закрыть. Попробуйте ещё раз."
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось закрыть. Попробуйте ещё раз.');
  });
});
