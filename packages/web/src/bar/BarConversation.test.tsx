import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { BarConversation } from './BarConversation.js';
import { fetchConversation, sendConversation } from './conversationApi.js';
import { ApiError } from '../api/apiFetch.js';
vi.mock('./conversationApi.js', () => ({ fetchConversation: vi.fn(), sendConversation: vi.fn() }));
const snapshot = { revision: 0, greeting: 'Привет! Присаживайся.', turns: [], pending: false };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchConversation).mockResolvedValue(snapshot);
});
const open = () =>
  render(<BarConversation character="maria" name="Мария" onClose={() => {}} onUpdate={() => {}} />);
it('shows the configured position below the name', async () => {
  render(
    <BarConversation
      character="veronika"
      name="Вероника"
      role="Управляющая"
      onClose={() => {}}
      onUpdate={() => {}}
    />,
  );
  expect(screen.getByText('Управляющая')).toBeInTheDocument();
  expect(screen.queryByText('Разговор в баре')).not.toBeInTheDocument();
  await screen.findByText(snapshot.greeting);
});
it('shows a fixed greeting without calling generation and can expand', async () => {
  open();
  expect(await screen.findByText(snapshot.greeting)).toBeInTheDocument();
  expect(sendConversation).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Развернуть разговор' }));
  expect(screen.getByRole('button', { name: 'Свернуть разговор' })).toBeInTheDocument();
});
it('sends only once while waiting and renders saved response', async () => {
  let resolve!: (s: typeof snapshot) => void;
  vi.mocked(sendConversation).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  open();
  await screen.findByText(snapshot.greeting);
  fireEvent.change(screen.getByRole('textbox', { name: 'Текст сообщения' }), {
    target: { value: 'Привет' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
  fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
  expect(sendConversation).toHaveBeenCalledTimes(1);
  await act(async () =>
    resolve({
      ...snapshot,
      revision: 1,
      turns: [{ id: 'id', user: 'Привет', assistant: 'Рада тебя видеть', createdAt: 'now' }],
    } as unknown as typeof snapshot),
  );
  expect(screen.getByText('Рада тебя видеть')).toBeInTheDocument();
});
it('retains draft and retries the same request after an uncertain network failure', async () => {
  vi.mocked(sendConversation)
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValue(snapshot);
  open();
  await screen.findByText(snapshot.greeting);
  fireEvent.change(screen.getByRole('textbox', { name: 'Текст сообщения' }), {
    target: { value: 'Привет' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('textbox')).toHaveValue('Привет');
  fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
  await waitFor(() => expect(sendConversation).toHaveBeenCalledTimes(2));
  expect(vi.mocked(sendConversation).mock.calls[0]?.[1]).toEqual(
    vi.mocked(sendConversation).mock.calls[1]?.[1],
  );
});
it('does not send while history failed to load and supports retry', async () => {
  vi.mocked(fetchConversation)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(snapshot);
  open();
  await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' }));
  await screen.findByText(snapshot.greeting);
  expect(fetchConversation).toHaveBeenCalledTimes(2);
});
it('retains text and reloads history on a stale revision instead of resending automatically', async () => {
  vi.mocked(sendConversation).mockRejectedValue(new ApiError(409, 'conversation_stale', 'stale'));
  open();
  await screen.findByText(snapshot.greeting);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Мой вопрос' } });
  fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
  await screen.findByRole('alert');
  await waitFor(() => expect(fetchConversation).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('textbox')).toHaveValue('Мой вопрос');
  expect(sendConversation).toHaveBeenCalledTimes(1);
});
