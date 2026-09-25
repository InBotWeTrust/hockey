import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type * as ConstructorCourtModule from '../game/MarksmanshipConstructorCourt.js';
import { MarksmanshipConstructorScreen } from './MarksmanshipConstructorScreen.js';

vi.mock('../game/MarksmanshipConstructorCourt.js', async (importOriginal) => ({
  ...await importOriginal<typeof ConstructorCourtModule>(),
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
  it('offers the eight V5 technique filters after entering a start', () => {
    renderScreen();
    fireEvent.change(screen.getByLabelText('Начало игры'), { target: { value: 'start-a' } });
    const filter = screen.getByRole('combobox', { name: 'Фильтр ситуаций' });
    expect(within(filter).getAllByRole('option')).toHaveLength(9);
    expect(within(filter).getByRole('option', { name: 'На грани' })).toBeInTheDocument();
    expect(within(filter).getByRole('option', { name: 'Сложный в углу' })).toBeInTheDocument();
    expect(within(filter).queryByRole('option', { name: 'У борта' })).not.toBeInTheDocument();
  });

  it('switches between the synthetic scheme and the two recorded runs', () => {
    renderScreen();
    expect(screen.getByRole('tab', { name: 'Учебная схема' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Егор · 78' }));
    expect(screen.getByRole('tab', { name: 'Егор · 78' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByLabelText('Начало игры')).not.toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Время повтора' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Дмитрий · 79' }));
    expect(screen.getByRole('list', { name: 'Записанные голы' }).querySelectorAll('li')).toHaveLength(79);
    fireEvent.click(screen.getByRole('tab', { name: 'Учебная схема' }));
    expect(screen.getByLabelText('Начало игры')).toBeInTheDocument();
  });
  it('starts at time zero and steps all entities through first-period time', () => {
    renderScreen();
    expect(screen.getByLabelText('Начало игры')).toHaveValue('pre-start');
    expect(screen.getByText('ДО СТАРТА')).toBeInTheDocument();
    expect(screen.queryByLabelText('Результат броска')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Время сцены')).toHaveValue('0');
    fireEvent.click(screen.getByRole('button', { name: 'Вперёд' }));
    expect(screen.getByLabelText('Начало игры')).toHaveValue('start-a');
    expect(screen.getByLabelText('Время сцены')).toHaveValue('50');
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить' }));
    expect(screen.getByLabelText('Время сцены')).toHaveValue('0');
    expect(screen.getByLabelText('Начало игры')).toHaveValue('pre-start');
  });

  it('uses the editable millisecond step for both arrow buttons', () => {
    renderScreen();
    const step = screen.getByRole('spinbutton', { name: 'Шаг, мс' });
    expect(step).toHaveValue(50);
    fireEvent.change(step, { target: { value: '125' } });
    fireEvent.click(screen.getByRole('button', { name: 'Вперёд' }));
    expect(screen.getByLabelText('Время сцены')).toHaveValue('125');
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
    expect(screen.getByLabelText('Время сцены')).toHaveValue('0');
  });

  it('keeps a reproducible selected start when resetting time', () => {
    renderScreen();
    fireEvent.change(screen.getByLabelText('Начало игры'), { target: { value: 'start-b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Вперёд' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить' }));
    expect(screen.getByLabelText('Начало игры')).toHaveValue('pre-start');
    fireEvent.change(screen.getByLabelText('Начало игры'), { target: { value: 'start-b' } });
    expect(screen.getByLabelText('Начало игры')).toHaveValue('start-b');
    expect(screen.queryByText('Начало')).not.toBeInTheDocument();
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

  it('places the primary controls between the title and the court', () => {
    renderScreen();
    const title = screen.getByRole('heading', { name: 'Конструктор меткости' });
    const primary = screen.getByRole('button', { name: 'Хитбоксы: вкл' })
      .closest('.marksmanship-constructor-primary-controls');
    const court = screen.getByRole('region', { name: 'Ситуация на площадке' });
    expect(primary).not.toBeNull();
    expect(title.compareDocumentPosition(primary!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(primary!.compareDocumentPosition(court)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByRole('button', { name: 'Вперёд' }).closest('.marksmanship-constructor-controls'))
      .toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText('Начало игры'), { target: { value: 'start-a' } });
    expect(screen.getByLabelText('Результат броска')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Характеристики ситуации' })).not.toBeInTheDocument();
    expect(screen.getByText(/Игрок X:/)).toBeInTheDocument();
    expect(screen.getByText('Очки за бросок:')).toBeInTheDocument();
    expect(screen.getByText('Очки за бросок:')).toHaveClass('marksmanship-constructor-detail-label');
    expect(screen.getByText('0', { selector: '.marksmanship-constructor-points' })).toBeInTheDocument();
    expect(screen.getByText('Игрок X:').parentElement).not.toBe(screen.getByText('Ворота при прилёте:').parentElement);
    expect(screen.getByText('Проверка вратаря:').parentElement).not.toBe(screen.getByText('Проверка ворот:').parentElement);
    expect(screen.getByLabelText('Результат броска')).toHaveClass('marksmanship-constructor-result--miss');
    expect(screen.getByRole('button', { name: 'Хитбоксы: вкл' }).closest('.marksmanship-constructor-row'))
      .toContainElement(screen.getByRole('button', { name: 'Сбросить' }));
    expect(screen.getByRole('button', { name: 'Назад' })).toHaveClass('marksmanship-constructor-step');
    expect(screen.getByLabelText('Время сцены').closest('.marksmanship-constructor-time'))
      .toHaveClass('marksmanship-constructor-time');
    fireEvent.click(screen.getByRole('button', { name: 'Назад в профиль' }));
    expect(screen.getByText('Профиль игрока')).toBeInTheDocument();
  });

  it('lists goals for the selected start and jumps to the shot time with its episode number', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    renderScreen();
    fireEvent.change(screen.getByLabelText('Начало игры'), { target: { value: 'start-a' } });
    const list = screen.getByRole('region', { name: 'Голевые ситуации' });
    await waitFor(() => expect(list.querySelectorAll('li').length).toBeGreaterThan(0), { timeout: 20_000 });
    const allCount = list.querySelectorAll('li').length;
    fireEvent.change(screen.getByRole('combobox', { name: 'Фильтр ситуаций' }),
      { target: { value: 'precise' } });
    expect(list.querySelectorAll('li').length).toBeLessThan(allCount);
    expect(Array.from(list.querySelectorAll('li p')).every((item) => item.textContent === 'Меткий'))
      .toBe(true);
    fireEvent.change(screen.getByRole('combobox', { name: 'Фильтр ситуаций' }),
      { target: { value: 'all' } });
    expect(list.querySelectorAll('li').length).toBe(allCount);
    const first = list.querySelector('li')!;
    const showButton = first.querySelector('button')!;
    expect(showButton).toHaveAttribute('title', 'Показать гол №1 на площадке');
    expect(showButton.querySelector('svg')).not.toBeNull();
    expect(showButton).not.toHaveTextContent('Показать');
    const label = first.textContent!.match(/(\d\d:\d\d\.\d\d)/)![1]!;
    fireEvent.click(showButton);
    expect(screen.getByText(label, { selector: 'output' })).toBeInTheDocument();
    expect(screen.getByText('Гол №:')).toBeInTheDocument();
    expect(screen.getByText('1', { selector: '.marksmanship-constructor-details__grid span' })).toBeInTheDocument();
    expect(screen.getByText(/^\+\d,\d$/, { selector: '.marksmanship-constructor-points' }))
      .toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  }, 25_000);
});
