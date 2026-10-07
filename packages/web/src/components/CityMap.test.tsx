import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { CityMap } from './CityMap.js';
function Location(): JSX.Element {
  const l = useLocation();
  return (
    <output aria-label="location">
      {l.pathname}
      {l.search}
    </output>
  );
}
function mount(amateur: boolean): void {
  render(
    <MemoryRouter>
      <CityMap
        amateur={amateur}
        dailyMeta="30/90"
        trainingMeta="0/100"
        tasksMeta="10/52"
        bonusMeta="27/50"
        attention={false}
      />
      <Location />
    </MemoryRouter>,
  );
}
describe('CityMap destination actions', () => {
  it('keeps daily play in the courtyard for beginners', () => {
    mount(false);
    fireEvent.click(screen.getByRole('button', { name: /Дворовый каток/ }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /Ежедневная игра/ }),
    );
    expect(screen.getByLabelText('location')).toHaveTextContent('/daily');
  });
  it('moves daily play to stadium for amateurs while courtyard keeps training', () => {
    mount(true);
    fireEvent.click(screen.getByRole('button', { name: /Любительский стадион/ }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /Ежедневная игра/ }),
    );
    expect(screen.getByLabelText('location')).toHaveTextContent('/daily');
  });
  it.each([
    ['Бар', '/bar'],
    ['Магазин', '/inventory'],
    ['Задания', '/achievements'],
    ['Бонусные игры', '/bonus-games'],
    ['Зал Славы', '/profile/achievements'],
    ['Дворовый каток', '/?view=training&from=sections'],
  ])('opens the original destination for %s', (name, path) => {
    mount(true);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
    expect(screen.getByLabelText('location').textContent).toBe(path);
  });
  it('opens amateur duels from the stadium', () => {
    mount(true);
    fireEvent.click(screen.getByRole('button', { name: /Любительский стадион/ }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Дуэли и турниры' }),
    );
    expect(screen.getByLabelText('location').textContent).toBe('/?view=amateur&from=sections');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('closes the courtyard chooser when a beginner opens training', () => {
    mount(false);
    fireEvent.click(screen.getByRole('button', { name: /Дворовый каток/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Тренировка/ }));
    expect(screen.getByLabelText('location').textContent).toBe('/?view=training&from=sections');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('prevents entering professional arena', () => {
    mount(true);
    expect(screen.getByRole('button', { name: /Профи-арена/ })).toBeDisabled();
  });
});
