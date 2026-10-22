import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { CitySettings } from './CitySettings.js';
import { apiFetch } from '../api/apiFetch.js';
vi.mock('../api/apiFetch.js', () => ({ apiFetch: vi.fn() }));
const city = {
  id: '1',
  name: 'Москва',
  region: 'Москва',
  country: 'Россия',
  latitude: 55.75,
  longitude: 37.62,
  timeZone: 'Europe/Moscow',
};
afterEach(() => {
  vi.resetAllMocks();
});
function view() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <CitySettings owner="user-1" />
      </QueryClientProvider>,
    ),
  };
}
it('searches only on submit and saves the found city in one action', async () => {
  vi.mocked(apiFetch).mockImplementation(async (path, init) => {
    if (path === '/me/city' && init?.method === 'PUT')
      return { city: { ...city, id: '2', name: 'Казань' } };
    if (path === '/me/city') return { city };
    if (path.startsWith('/cities?'))
      return { cities: [{ id: 2, name: 'Казань', region: 'Татарстан', country: 'Россия' }] };
    return { status: 'unavailable', weather: null };
  });
  view();
  await screen.findByText(/^Москва$/);
  fireEvent.change(screen.getByRole('textbox', { name: 'Найти город' }), {
    target: { value: 'Казань' },
  });
  expect(vi.mocked(apiFetch).mock.calls.some(([path]) => path.startsWith('/cities?'))).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить город' }));
  expect(await screen.findByText(/^Казань$/)).toBeVisible();
  expect(apiFetch).toHaveBeenCalledWith(
    '/me/city',
    expect.objectContaining({ method: 'PUT', body: JSON.stringify({ cityId: '2' }) }),
  );
  expect(screen.queryByRole('list')).toBeNull();
});
it('reports no match without changing the saved city', async () => {
  vi.mocked(apiFetch).mockImplementation(async (path) =>
    path === '/me/city'
      ? { city }
      : path.startsWith('/cities?')
        ? { cities: [] }
        : { status: 'unavailable', weather: null },
  );
  view();
  await screen.findByText(/^Москва$/);
  fireEvent.change(screen.getByRole('textbox', { name: 'Найти город' }), {
    target: { value: 'Несуществующий город' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить город' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Такой город не найден');
  expect(screen.getByText(/^Москва$/)).toBeVisible();
  expect(apiFetch).not.toHaveBeenCalledWith('/me/city', expect.objectContaining({ method: 'PUT' }));
});
it('prevents duplicate submits and retains the city on a save failure', async () => {
  let resolve!: (value: unknown) => void;
  vi.mocked(apiFetch).mockImplementation(async (path, init) => {
    if (init?.method === 'PUT') throw new Error('offline');
    if (path === '/me/city') return { city };
    if (path.startsWith('/cities?'))
      return new Promise((r) => {
        resolve = r;
      });
    return { status: 'unavailable', weather: null };
  });
  view();
  await screen.findByText(/^Москва$/);
  const input = screen.getByRole('textbox', { name: 'Найти город' });
  fireEvent.change(input, { target: { value: 'Казань' } });
  const submit = screen.getByRole('button', { name: 'Сохранить город' });
  fireEvent.click(submit);
  fireEvent.click(submit);
  await waitFor(() => expect(resolve).toBeDefined());
  expect(input).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Сбросить город' })).toBeDisabled();
  expect(
    vi.mocked(apiFetch).mock.calls.filter(([path]) => path.startsWith('/cities?')),
  ).toHaveLength(1);
  await act(async () =>
    resolve({ cities: [{ id: 2, name: 'Казань', region: '', country: 'Россия' }] }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось сохранить');
  expect(screen.getByText(/^Москва$/)).toBeVisible();
});
it('resets with the circular icon beside the city name', async () => {
  vi.mocked(apiFetch).mockImplementation(async (path, init) =>
    path === '/me/city'
      ? { city: init?.method === 'PUT' ? null : city }
      : { status: 'unavailable', weather: null },
  );
  view();
  await screen.findByText(/^Москва$/);
  const reset = screen.getByRole('button', { name: 'Сбросить город' });
  expect(reset).toHaveClass('icon-btn');
  expect(reset.parentElement).toHaveTextContent('Москва');
  fireEvent.click(reset);
  expect(await screen.findByText('Город не выбран')).toBeVisible();
  expect(apiFetch).toHaveBeenCalledWith(
    '/me/city',
    expect.objectContaining({ method: 'PUT', body: JSON.stringify({ cityId: null }) }),
  );
});
