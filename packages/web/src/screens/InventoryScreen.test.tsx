import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InventoryScreen } from './InventoryScreen.js';

describe('InventoryScreen', () => {
  it('renders the new inventory sections', () => {
    render(<InventoryScreen />);

    expect(screen.getByLabelText('Валюта')).toBeInTheDocument();
    expect(screen.getByText('У вас пока нет накопленных денег')).toBeInTheDocument();
    expect(screen.getByLabelText('Инвентарь')).toBeInTheDocument();
    expect(screen.getByText('Валюта').compareDocumentPosition(screen.getByText('Инвентарь'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getByText('Клюшки')).toBeInTheDocument();
    expect(screen.getByText('Коньки')).toBeInTheDocument();
    expect(screen.getByText('Спортпитание')).toBeInTheDocument();
    expect(screen.getByText('Более точные и быстрые броски по воротам')).toBeInTheDocument();
    expect(screen.getByText('Управление скоростью перемещения игрока')).toBeInTheDocument();
    expect(screen.getByText('Ускоренное восстановление и меньшая усталость')).toBeInTheDocument();
    expect(screen.getByLabelText('Изображение инвентаря Клюшки')).toBeInTheDocument();
    expect(screen.getByLabelText('Изображение инвентаря Коньки')).toBeInTheDocument();
    expect(screen.getByLabelText('Изображение инвентаря Спортпитание')).toBeInTheDocument();
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
        name: /Спортпитание: Ускоренное восстановление и меньшая усталость\. Недоступно/,
      }),
    ).toBeEnabled();
  });

  it('opens a locked modal from inventory cards', () => {
    render(<InventoryScreen />);

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
