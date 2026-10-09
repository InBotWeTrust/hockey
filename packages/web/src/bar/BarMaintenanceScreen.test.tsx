import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { BarMaintenanceScreen } from './BarMaintenanceScreen.js';

afterEach(cleanup);

describe('bar maintenance', () => {
  it.each(['/bar', '/bar/duel/live-0'])('shows maintenance instead of broadcasts at %s', (path) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/bar/*" element={<BarMaintenanceScreen />} />
          <Route path="/sections" element={<h1>Быстрый доступ</h1>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Бар', level: 1 })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Бар на ремонте. Готовим место для трансляций, обсуждений и быстрых мини-игр. Скоро откроемся.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
    expect(screen.getByRole('heading', { name: 'Быстрый доступ' })).toBeInTheDocument();
  });
});
