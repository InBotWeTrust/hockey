import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createDefaultBarLayout, type BarLayoutSnapshot } from '@hockey/game-core';
import { BarAdmin } from './BarAdmin.js';
import { fetchAdminBarLayout, saveAdminBarLayout } from '../bar/layoutApi.js';
vi.mock('../bar/layoutApi.js', () => ({
  fetchAdminBarLayout: vi.fn(),
  saveAdminBarLayout: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchAdminBarLayout).mockResolvedValue({
    revision: 1,
    layout: createDefaultBarLayout(),
  });
});
it('moves a character and only persists on Save', async () => {
  vi.mocked(saveAdminBarLayout).mockImplementation(async (s) => ({ ...s, revision: 2 }));
  render(<BarAdmin />);
  await screen.findByLabelText('Содержимое страницы');
  fireEvent.change(screen.getByLabelText('Редактируемая страница'), { target: { value: 'bar-6' } });
  fireEvent.change(screen.getByLabelText('Содержимое страницы'), { target: { value: 'maria' } });
  expect(saveAdminBarLayout).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  await screen.findByText('Расстановка сохранена.');
  const sent = vi.mocked(saveAdminBarLayout).mock.calls[0]![0];
  expect(sent.layout.slots[2]!.occupantId).toBe(null);
  expect(sent.layout.slots[5]!.occupantId).toBe('maria');
});
it('preserves draft on conflict and prevents repeated saves', async () => {
  let reject: (e: Error) => void = () => {};
  vi.mocked(saveAdminBarLayout).mockImplementation(
    () =>
      new Promise((_resolve, r) => {
        reject = r;
      }),
  );
  render(<BarAdmin />);
  await screen.findByLabelText('Содержимое страницы');
  fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Вера' } });
  const save = screen.getByRole('button', { name: 'Сохранить' });
  fireEvent.click(save);
  fireEvent.click(save);
  expect(saveAdminBarLayout).toHaveBeenCalledTimes(1);
  reject(Object.assign(new Error('conflict'), { status: 409 }));
  await screen.findByText(/Расстановка уже изменена/);
  expect(screen.getByLabelText('Имя')).toHaveValue('Вера');
});
it('reorders slots and keeps the default attached to its ID', async () => {
  vi.mocked(saveAdminBarLayout).mockImplementation(async (s) => ({ ...s, revision: 2 }));
  render(<BarAdmin />);
  await screen.findByLabelText('Содержимое страницы');
  fireEvent.click(screen.getByRole('button', { name: 'Переместить страницу выше' }));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  await waitFor(() => expect(saveAdminBarLayout).toHaveBeenCalled());
  const saved = vi.mocked(saveAdminBarLayout).mock.calls[0]![0].layout;
  expect(saved.defaultSlotId).toBe('bar-8');
  expect(saved.slots[6]!.id).toBe('bar-8');
});

it('ignores older reads arriving after a newer StrictMode read', async () => {
  const { StrictMode } = await import('react');
  const { act } = await import('@testing-library/react');
  const pending: Array<(s: BarLayoutSnapshot) => void> = [];
  vi.mocked(fetchAdminBarLayout).mockImplementation(() => new Promise((r) => pending.push(r)));
  render(
    <StrictMode>
      <BarAdmin />
    </StrictMode>,
  );
  const newer = { revision: 2, layout: createDefaultBarLayout() };
  newer.layout.profiles.veronika.name = 'Новая версия';
  await act(async () => pending[1]!(newer));
  expect(screen.getByLabelText('Имя')).toHaveValue('Новая версия');
  await act(async () => pending[0]!({ revision: 1, layout: createDefaultBarLayout() }));
  expect(screen.getByLabelText('Имя')).toHaveValue('Новая версия');
});

it('asks in an accessible modal before discarding the draft', async () => {
  render(<BarAdmin />);
  await screen.findByLabelText('Имя');
  fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Несохранённое имя' } });
  fireEvent.click(screen.getByRole('button', { name: 'Загрузить заново' }));
  expect(
    screen.getByRole('dialog', { name: 'Загрузить сохранённую расстановку?' }),
  ).toBeInTheDocument();
  expect(fetchAdminBarLayout).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Оставить правки' }));
  expect(screen.getByLabelText('Имя')).toHaveValue('Несохранённое имя');
});
