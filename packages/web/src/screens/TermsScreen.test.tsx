import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { TermsScreen } from './TermsScreen.js';

describe('TermsScreen', () => {
  it('publishes the seller and game usage terms', () => {
    render(
      <MemoryRouter>
        <TermsScreen />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Пользовательское соглашение' })).toBeInTheDocument();
    expect(screen.getByText('ИП Гуменюк Егор Михайлович')).toBeInTheDocument();
    expect(screen.getByText(/ОГРНИП 323100000016441/)).toBeInTheDocument();
    expect(screen.getByText(/ИНН 101602099457/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'egorgumenyuk@yandex.ru' })).toHaveAttribute(
      'href',
      'mailto:egorgumenyuk@yandex.ru',
    );
    expect(screen.getByRole('heading', { name: /Правила использования/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Публичная оферта' })).toHaveAttribute('href', '/offer');
    expect(screen.getByRole('link', { name: 'Вернуться к тарифам' })).toHaveAttribute(
      'href',
      '/prices',
    );
  });
});
