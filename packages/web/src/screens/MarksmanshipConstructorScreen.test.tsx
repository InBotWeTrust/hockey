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

  it('uses one visual hitbox switch and a manual mode without invented points', () => {
    renderScreen();
    expect(screen.getByRole('button', { name: 'Хитбоксы: вкл' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Хитбоксы: вкл' }));
    expect(screen.getByRole('button', { name: 'Хитбоксы: выкл' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ручная расстановка' }));
    expect(screen.getByLabelText('Центр хитбокса ворот')).toBeInTheDocument();
    expect(screen.getByLabelText('Центр хитбокса вратаря')).toBeInTheDocument();
    expect(screen.getByLabelText('X линии броска игрока')).toBeInTheDocument();
    expect(screen.getByText('Ручная расстановка — очки не рассчитываются')).toBeInTheDocument();
  });

  it('shows a concise result over the ice and returns to profile', () => {
    renderScreen();
    expect(screen.getByLabelText('Результат броска')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Характеристики ситуации' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Назад в профиль' }));
    expect(screen.getByText('Профиль игрока')).toBeInTheDocument();
  });
});
