import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/arsenich.js';
import { DestinationIntroduction } from './DestinationIntroduction.js';

vi.mock('../api/arsenich.js', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  fetchArsenichDestinationIntroduction: vi.fn(),
  completeArsenichDestinationIntroduction: vi.fn(),
}));

function renderIntro(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <button type="button">Кнопка раздела</button>
      <DestinationIntroduction destination="training-course" />
    </QueryClientProvider>,
  );
}

describe('DestinationIntroduction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts as a blocking compact prompt and expands the explanation on request', async () => {
    vi.mocked(api.fetchArsenichDestinationIntroduction).mockResolvedValue({
      intro: {
        destinationKey: 'training-course',
        revision: 1,
        speaker: 'stranger',
        windows: [
          {
            title: 'Тренировки',
            body:
              'Тут можно спокойно отработать бросок.\n\n- Начни с первого упражнения.\n- Проходи следующие по порядку.',
            ctaLabel: 'Понятно',
          },
        ],
      },
    });
    vi.mocked(api.completeArsenichDestinationIntroduction).mockResolvedValue({ viewed: true });
    renderIntro();

    const prompt = await screen.findByRole('dialog', { name: 'Тренировки' });
    expect(prompt).toHaveClass('glass-dark');
    expect(prompt).toHaveAttribute('aria-modal', 'true');
    expect(
      prompt.closest('.arsenich-introduction-shell'),
    ).not.toHaveClass('glass-edge-fade', 'glass-edge-fade--bottom');
    expect(document.querySelector('.arsenich-introduction__blocker')).toBeInTheDocument();
    const spokenHeading = document.querySelector<HTMLElement>(
      '.arsenich-introduction__copy strong',
    );
    expect(spokenHeading).not.toBeNull();
    expect(spokenHeading).toHaveAttribute('data-typing-done', 'false');
    expect(screen.queryByRole('button', { name: 'Узнать подробнее' })).not.toBeInTheDocument();
    expect(screen.queryByText('Незнакомец у площадки')).not.toBeInTheDocument();
    const avatar = document.querySelector<HTMLImageElement>('.arsenich-introduction__avatar');
    expect(avatar).toHaveAttribute('src', '/arsenich/dovolny-arsenich.png');
    expect(avatar).toHaveAttribute('alt', '');
    const header = document.querySelector<HTMLElement>('.arsenich-introduction__header');
    let description = document.querySelector<HTMLElement>('.arsenich-introduction__description');
    expect(header).not.toBeNull();
    expect(description).toBeNull();
    expect(header).toContainElement(avatar);
    expect(header).toContainElement(spokenHeading);
    expect(screen.queryByText('Тут можно спокойно отработать бросок.')).not.toBeInTheDocument();
    expect(document.querySelector('.modal-backdrop')).not.toBeInTheDocument();

    await waitFor(() => expect(spokenHeading).toHaveAttribute('data-typing-done', 'true'));
    expect(screen.queryByRole('button', { name: 'Узнать подробнее' })).not.toBeInTheDocument();
    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Узнать подробнее' })).toBeInTheDocument(),
      { timeout: 800 },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Узнать подробнее' }));
    description = document.querySelector<HTMLElement>('.arsenich-introduction__description');
    expect(description).not.toBeNull();
    expect(within(description!).getByText('Тут можно спокойно отработать бросок.')).toBeInTheDocument();
    expect(within(description!).getAllByRole('listitem')).toHaveLength(2);
    expect(within(description!).getByText('Начни с первого упражнения.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Понятно' })).toHaveClass(
      'btn',
      'btn--cta',
    );
    expect(screen.queryByRole('button', { name: /закрыть|пропустить/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));
    await waitFor(() =>
      expect(api.completeArsenichDestinationIntroduction).toHaveBeenCalledWith(
        'training-course',
        1,
      ),
    );
  });
});
