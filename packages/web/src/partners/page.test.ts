import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { initializePartnersPage } from './page.js';

const html = readFileSync('partners/index.html', 'utf8');

beforeEach(() => {
  document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
  window.history.replaceState({}, '', '/partners');
});

describe('partners presentation', () => {
  it('offers the separate public trial, retaining only bounded source tags', () => {
    window.history.replaceState(
      {},
      '',
      '/partners?utm_source=arena&utm_medium=outreach&token=private&email=a%40b.ru',
    );
    initializePartnersPage();
    const links = screen.getAllByRole('link', { name: 'Попробовать игру' });
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/try?utm_source=arena&utm_medium=outreach');
    }
    expect(screen.getByRole('link', { name: 'Написать в Telegram' })).toHaveAttribute(
      'href',
      'https://t.me/in_bot_we_trust',
    );
  });

  it('keeps unavailable media honest and never requests an empty video source', () => {
    initializePartnersPage();
    expect(screen.getByText('Скоро здесь появится трейлер')).toBeVisible();
    expect(document.querySelector('video')).toBeNull();
    expect(screen.getAllByText('Скриншот скоро')).toHaveLength(6);
    expect(screen.queryByRole('button', { name: /Увеличить/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Возможности сотрудничества' })).toHaveAttribute(
      'href',
      '#partnership',
    );
  });
});

it('uses supplied video without autoplay or eagerly downloading the clip', () => {
  initializePartnersPage({
    trailer: { src: '/partners/media/trailer.mp4', poster: '/partners/media/poster.webp' },
    screenshots: {},
  });
  const video = screen.getByLabelText('Трейлер Ultimate Hockey') as HTMLVideoElement;
  expect(video.getAttribute('src')).toBe('/partners/media/trailer.mp4');
  expect(video.preload).toBe('none');
  expect(video.autoplay).toBe(false);
  expect(video.controls).toBe(true);
  expect(video.playsInline).toBe(true);
  expect(screen.queryByText('Скоро здесь появится трейлер')).toBeNull();
});

it('opens a supplied screenshot and restores focus when the viewer closes', () => {
  // jsdom does not implement native dialog methods.
  const dialog = document.querySelector('dialog')!;
  dialog.showModal = vi.fn(() => {
    dialog.setAttribute('open', '');
  });
  dialog.close = vi.fn(() => {
    dialog.removeAttribute('open');
    dialog.dispatchEvent(new Event('close'));
  });
  initializePartnersPage({
    trailer: { src: null, poster: '' },
    screenshots: { city: '/partners/media/city.webp' },
  });
  const link = screen.getByRole('link', { name: 'Увеличить: Хоккейный город' });
  fireEvent.click(link);
  expect(screen.getByRole('dialog', { name: 'Хоккейный город' })).toBeVisible();
  expect(dialog.querySelector('img')).toHaveAttribute('src', '/partners/media/city.webp');
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть изображение' }));
  expect(dialog.open).toBe(false);
  expect(link).toHaveFocus();
});

it('bounds source tags and keeps ordinary links clean without a campaign', () => {
  window.history.replaceState(
    {},
    '',
    '/partners?utm_source=' + 'a'.repeat(300) + '&utm_campaign=%20%20',
  );
  initializePartnersPage();
  expect(screen.getAllByRole('link', { name: 'Попробовать игру' })[0]).toHaveAttribute(
    'href',
    '/try?utm_source=' + 'a'.repeat(100),
  );
  window.history.replaceState({}, '', '/partners');
  initializePartnersPage();
  expect(screen.getAllByRole('link', { name: 'Попробовать игру' })[0]).toHaveAttribute(
    'href',
    '/try',
  );
});
