import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { OfferScreen, PersonalDataConsentScreen, PrivacyScreen } from './LegalDocuments.js';

function renderDocument(node: JSX.Element): void {
  render(<MemoryRouter>{node}</MemoryRouter>);
}

describe('public legal documents', () => {
  it('publishes the offer for digital coin packages', () => {
    renderDocument(<OfferScreen />);

    expect(screen.getByRole('heading', { name: 'Публичная оферта' })).toBeInTheDocument();
    expect(screen.getByText(/ОГРНИП 323100000016441/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Предмет оферты/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Оплата и зачисление/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Возвраты/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Войти' })).toHaveAttribute('href', '/login');
  });

  it('publishes the privacy policy and identifies payment data boundaries', () => {
    renderDocument(<PrivacyScreen />);

    expect(screen.getByRole('heading', { name: 'Политика конфиденциальности' })).toBeInTheDocument();
    expect(screen.getAllByText(/Telegram и ВКонтакте/i)).toHaveLength(2);
    expect(screen.getByText(/данные банковской карты.*ЮKassa/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'egorgumenyuk@yandex.ru' })).toHaveAttribute(
      'href',
      'mailto:egorgumenyuk@yandex.ru',
    );
  });

  it('publishes a separate personal-data consent', () => {
    renderDocument(<PersonalDataConsentScreen />);

    expect(screen.getByRole('heading', { name: 'Согласие на обработку персональных данных' })).toBeInTheDocument();
    expect(screen.getByText(/ИП Гуменюку Егору Михайловичу/)).toBeInTheDocument();
    expect(screen.getByText(/отозвать согласие/i)).toBeInTheDocument();
  });
});
