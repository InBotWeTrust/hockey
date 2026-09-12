import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { PricesScreen } from './PricesScreen.js';

const packageFixture = {
  id: '00000000-0000-4000-8000-000000000601',
  slug: 'starter',
  title: 'Стартовый набор',
  description: 'Чтобы начать сезон увереннее',
  coinAmount: 500,
  priceRub: 199,
  badgeText: 'Выгодно',
  marker: 'hit' as const,
  sortOrder: 1,
};

function renderPrices(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <PricesScreen />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('PricesScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a non-interactive public catalogue after packages load', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ packages: [packageFixture] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    renderPrices();

    expect(screen.getByRole('heading', { name: 'Пакеты монет' })).toBeInTheDocument();
    expect(await screen.findByText('Стартовый набор')).toBeInTheDocument();
    expect(screen.getByText('Чтобы начать сезон увереннее')).toBeInTheDocument();
    expect(screen.getByText('500 монет')).toBeInTheDocument();
    expect(screen.getByText(/199.*₽/)).toBeInTheDocument();
    expect(screen.getByText('Хит')).toBeInTheDocument();
    expect(screen.getByText('Выгодно')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Пользовательское соглашение' })).toHaveAttribute(
      'href',
      '/terms',
    );
    expect(screen.getByText('ИП Гуменюк Егор Михайлович')).toBeInTheDocument();
    expect(screen.getByText(/ОГРНИП 323100000016441/)).toBeInTheDocument();
    expect(screen.getByText(/ИНН 101602099457/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'egorgumenyuk@yandex.ru' })).toHaveAttribute(
      'href',
      'mailto:egorgumenyuk@yandex.ru',
    );
    expect(screen.getByText(/зачисляются.*после успешной оплаты/i)).toBeInTheDocument();
    expect(screen.getByText(/физическая доставка не требуется/i)).toBeInTheDocument();
    expect(screen.queryByText(/войти|регистрац|купить/i)).not.toBeInTheDocument();
  });

  it('shows a loading status while the public catalogue is requested', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => undefined));

    renderPrices();

    expect(screen.getByRole('status')).toHaveTextContent('Загружаем пакеты…');
  });

  it('shows a retryable error without adding an action control', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    renderPrices();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось загрузить пакеты. Попробуйте обновить страницу.',
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Пользовательское соглашение' })).toBeInTheDocument();
  });

  it('explains when no public packages are available', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ packages: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    renderPrices();

    await waitFor(() => {
      expect(screen.getByText('Пакеты монет пока не опубликованы.')).toBeInTheDocument();
    });
  });
});
