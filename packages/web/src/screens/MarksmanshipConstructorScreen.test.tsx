import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { MarksmanshipConstructorScreen } from './MarksmanshipConstructorScreen.js';

vi.mock('../game/MarksmanshipConstructorCourt.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../game/MarksmanshipConstructorCourt.js')>(),
  MarksmanshipConstructorCourt: () => <div aria-label="Площадка конструктора" />,
}));

function renderScreen() {
  render(<MemoryRouter initialEntries={['/profile/marksmanship-constructor']}>
    <Routes>
      <Route path="/profile/marksmanship-constructor" element={<MarksmanshipConstructorScreen />} />
      <Route path="/profile" element={<div>Профиль игрока</div>} />
    </Routes>
  </MemoryRouter>);
}

describe('MarksmanshipConstructorScreen', () => {
  it('starts at time zero and steps all entities through first-period time', () => {
    renderScreen();
    expect(screen.getByLabelText('Время сцены')).toHaveValue('0');
    fireEvent.click(screen.getByRole('button', { name: 'Вперёд' }));
    expect(screen.getByLabelText('Время сцены')).toHaveValue('50');
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить' }));
    expect(screen.getByLabelText('Время сцены')).toHaveValue('0');
  });

  it('keeps a reproducible selected start when resetting time', () => {
    renderScreen();
    fireEvent.change(screen.getByLabelText('Начало игры'), { target: { value: 'start-b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Вперёд' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить' }));
    expect(screen.getByLabelText('Начало игры')).toHaveValue('start-b');
    expect(screen.getByLabelText('Время сцены')).toHaveValue('0');
  });

  it('keeps the hitbox switch without offering manual placement', () => {
    renderScreen();
    expect(screen.getByRole('button', { name: 'Хитбоксы: вкл' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Хитбоксы: вкл' }));
    expect(screen.getByRole('button', { name: 'Хитбоксы: выкл' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ручная расстановка' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Центр хитбокса ворот')).not.toBeInTheDocument();
  });

  it('scrubs the whole three-minute first period', () => {
    renderScreen();
    const time = screen.getByLabelText('Время сцены');
    expect(time).toHaveAttribute('max', '180000');
    fireEvent.change(time, { target: { value: '180000' } });
    expect(screen.getByText('03:00.00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить' }));
    expect(time).toHaveValue('0');
  });

  it('shows a concise result over the ice and returns to profile', () => {
    renderScreen();
    expect(screen.getByLabelText('Результат броска')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Характеристики ситуации' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Назад в профиль' }));
    expect(screen.getByText('Профиль игрока')).toBeInTheDocument();
  });
});
