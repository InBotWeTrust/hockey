import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryScreen } from './InventoryScreen.js';

function mockMe(currencyBalance?: number): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ currencyBalance }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

function renderInventory(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <InventoryScreen />
    </QueryClientProvider>,
  );
}

describe('InventoryScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockMe(0);
  });

  it('renders the new inventory sections', () => {
    renderInventory();

    expect(screen.getByLabelText('Валюта')).toBeInTheDocument();
    expect(screen.getByLabelText('Баланс: 0 токенов')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByLabelText('Инвентарь')).toBeInTheDocument();
    expect(screen.getByText('Валюта').compareDocumentPosition(screen.getByText('Инвентарь'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getByText('Клюшки')).toBeInTheDocument();
    expect(screen.getByText('Коньки')).toBeInTheDocument();
    expect(screen.getByText('Энергия')).toBeInTheDocument();
    expect(screen.getByText('Более точные и быстрые броски по воротам')).toBeInTheDocument();
    expect(screen.getByText('Управление скоростью перемещения игрока')).toBeInTheDocument();
    expect(screen.getByText('Ускоренное восстановление и меньшая усталость')).toBeInTheDocument();
    expect(screen.getByLabelText('Изображение инвентаря Клюшки')).toBeInTheDocument();
    expect(screen.getByLabelText('Изображение инвентаря Коньки')).toBeInTheDocument();
    expect(screen.getByLabelText('Изображение инвентаря Энергия')).toBeInTheDocument();
    expect(screen.getByLabelText('Изображение инвентаря Клюшки').querySelector('img')).toHaveStyle({
      filter: 'grayscale(1) saturate(0.1)',
      opacity: '0.58',
    });
    expect(
      screen.getByRole('button', {
        name: /Клюшки: Более точные и быстрые броски по воротам\. Недоступно/,
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', {
        name: /Коньки: Управление скоростью перемещения игрока\. Недоступно/,
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', {
        name: /Энергия: Ускоренное восстановление и меньшая усталость\. Недоступно/,
      }),
    ).toBeEnabled();
  });

  it('shows the user currency balance when it is available', async () => {
    mockMe(23);

    renderInventory();

    expect(await screen.findByLabelText('Баланс: 23 токена')).toBeInTheDocument();
    expect(screen.getByText('23')).toBeInTheDocument();
  });

  it('opens a locked modal from inventory cards', () => {
    renderInventory();

    fireEvent.click(
      screen.getByRole('button', {
        name: /Клюшки: Более точные и быстрые броски по воротам\. Недоступно/,
      }),
    );

    expect(screen.getByRole('dialog', { name: 'Недоступно' })).toBeInTheDocument();
    expect(
      screen.getByText('Инвентарь пока недоступен. Откроем его в следующих обновлениях.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));
    expect(screen.queryByRole('dialog', { name: 'Недоступно' })).not.toBeInTheDocument();
  });
});
