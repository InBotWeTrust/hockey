import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RegularSeasonPodiumCongratulation } from '../api/tournament.js';
import { RegularSeasonPodiumModal } from './RegularSeasonPodiumModal.js';

function congratulation(
  overrides: Partial<RegularSeasonPodiumCongratulation> = {},
): RegularSeasonPodiumCongratulation {
  return {
    id: '00000000-0000-4000-8000-000000000951',
    tournamentId: '00000000-0000-4000-8000-000000000952',
    tournamentTitle: 'Кубок Ледовой арены',
    place: 1,
    reward: { coins: 5000, stars: 25, experience: 1500 },
    createdAt: '2026-09-03T21:00:00.000Z',
    ...overrides,
  };
}

describe('RegularSeasonPodiumModal', () => {
  it('renders the second-place title, tournament, and silver artwork', () => {
    render(
      <RegularSeasonPodiumModal
        congratulation={congratulation({ place: 2 })}
        pending={false}
        error={null}
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('heading', {
        name: 'Вы заняли 2-е место в регулярном чемпионате!',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Кубок Ледовой арены')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      '/tournament-results/regular-season-second.webp',
    );
  });

  it('shows only non-zero rewards with accessible values', () => {
    render(
      <RegularSeasonPodiumModal
        congratulation={congratulation({
          reward: { coins: 3000, stars: 0, experience: 900 },
        })}
        pending={false}
        error={null}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText('Награды')).toHaveClass('section-label');
    expect(screen.getByLabelText('Монеты: 3000')).toBeInTheDocument();
    expect(screen.queryByLabelText('Звёзды: 0')).toBeNull();
    expect(screen.getByLabelText('Опыт: 900')).toBeInTheDocument();
  });

  it('hides the whole reward section when every reward is zero', () => {
    render(
      <RegularSeasonPodiumModal
        congratulation={congratulation({ reward: { coins: 0, stars: 0, experience: 0 } })}
        pending={false}
        error={null}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.queryByText('Награды')).toBeNull();
  });

  it('can only request closing from its action button', () => {
    const onConfirm = vi.fn();
    render(
      <RegularSeasonPodiumModal
        congratulation={congratulation()}
        pending={false}
        error={null}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.mouseDown(screen.getByRole('presentation'));
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('disables repeat submission and keeps an acknowledgement error visible', () => {
    render(
      <RegularSeasonPodiumModal
        congratulation={congratulation()}
        pending
        error="Не удалось закрыть. Попробуйте ещё раз."
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось закрыть. Попробуйте ещё раз.');
    expect(screen.getByRole('button', { name: 'Закрываем…' })).toBeDisabled();
  });
});
