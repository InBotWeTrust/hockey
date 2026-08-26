import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OfficialDialogModal } from './AdminScreen.js';

const dialog = {
  chatId: '11111111-1111-4111-8111-111111111111',
  status: 'open' as const,
  isNew: true,
  player: {
    userId: '22222222-2222-4222-8222-222222222222',
    displayName: 'Алексей',
    avatarUrl: null,
    telegramId: '12345',
    vkId: null,
  },
  lastMessage: {
    id: '33333333-3333-4333-8333-333333333333',
    content: 'Помогите',
    createdAt: '2026-08-26T10:00:00.000Z',
    fromOfficial: false,
  },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OfficialDialogModal', () => {
  it('offers attachments and voice recording and sends a reply from the game', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith(`/admin/communications/dialogs/${dialog.chatId}/uploads`)) {
        return new Response(
          JSON.stringify({
            media: {
              id: '55555555-5555-4555-8555-555555555555',
              url: '/api/media/file',
              key: 'official-dialog/file.txt',
              kind: 'file',
              contentType: 'text/plain',
              size: 5,
              originalName: 'note.txt',
              createdAt: '2026-08-26T10:00:30.000Z',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (
        url.endsWith(`/admin/communications/dialogs/${dialog.chatId}/messages`) &&
        init?.method === 'POST'
      ) {
        return new Response(
          JSON.stringify({
            id: '44444444-4444-4444-8444-444444444444',
            chatId: dialog.chatId,
            senderId: 'official',
            senderDisplayName: 'Ультимейт Хоккей',
            senderAvatarUrl: '/icons/official-account.webp',
            content: 'Мы уже помогаем',
            replyToId: null,
            isDeleted: false,
            createdAt: '2026-08-26T10:01:00.000Z',
            updatedAt: '2026-08-26T10:01:00.000Z',
            isEdited: false,
            reactions: [],
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <OfficialDialogModal dialog={dialog} onClose={vi.fn()} onChanged={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('button', { name: 'Прикрепить' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Записать голосовое' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Прикрепить' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Файл' }));
    const fileInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    fireEvent.change(fileInputs[1]!, {
      target: { files: [new File(['hello'], 'note.txt', { type: 'text/plain' })] },
    });
    expect(await screen.findByText('note.txt')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Текст сообщения' }), {
      target: { value: 'Мы уже помогаем' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/admin/communications/dialogs/${dialog.chatId}/messages`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            content: 'Мы уже помогаем',
            attachmentIds: ['55555555-5555-4555-8555-555555555555'],
          }),
        }),
      ),
    );
  });
});
