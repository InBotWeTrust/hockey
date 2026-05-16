import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatListItem } from '../components/ChatListItem.js';
import { useAuthStore } from '../../auth/authStore.js';
import { useChatStore } from '../chatStore.js';
import type { ChatDTO } from '../api.js';

function makeChat(overrides: Partial<ChatDTO> = {}): ChatDTO {
  return {
    id: 'chat-1',
    type: 'direct',
    name: null,
    entityType: null,
    entityId: null,
    lastMessageAt: '2026-05-03T13:49:00.000Z',
    unreadCount: 0,
    lastMessage: {
      id: 'message-1',
      chatId: 'chat-1',
      senderId: 'me',
      senderDisplayName: 'Dev Player',
      senderAvatarUrl: null,
      content: 'Привет',
      replyToId: null,
      isDeleted: false,
      createdAt: '2026-05-03T13:49:00.000Z',
      reactions: [],
    },
    lastMessageSenderName: 'Dev Player',
    dmCounterpart: {
      userId: 'friend',
      displayName: 'Friend',
      avatarUrl: null,
      lastSeenAt: null,
      lastReadAt: null,
    },
    memberCount: 2,
    pinnedAt: null,
    ...overrides,
  };
}

describe('ChatListItem', () => {
  function setMe(): void {
    useAuthStore.setState({
      accessToken: 'tok',
      refreshToken: 'rtok',
      user: { id: 'me', displayName: 'Me', grip: 'right' },
    });
    useChatStore.setState({ unreadByChat: {}, activeChatId: null });
  }

  it('renders channel post previews without an author prefix', () => {
    setMe();

    render(
      <ChatListItem
        chat={makeChat({
          type: 'channel',
          name: 'Новости игры',
          dmCounterpart: null,
          memberCount: 10,
          lastMessage: {
            ...makeChat().lastMessage!,
            content: '**Жирный текст** и __курсивный текст__',
          },
        })}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByText(/Жирный текст и курсивный/)).toBeInTheDocument();
    expect(screen.queryByText(/Вы:/)).toBeNull();
  });

  it('keeps the current user prefix in regular chat previews', () => {
    setMe();

    render(
      <ChatListItem
        chat={makeChat({
          lastMessage: {
            ...makeChat().lastMessage!,
            content: 'Привет из лички',
          },
        })}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByText('Вы: Привет из лички')).toBeInTheDocument();
  });

  it('shows voice message fallback when the last message has audio metadata', () => {
    setMe();

    render(
      <ChatListItem
        chat={makeChat({
          lastMessage: {
            ...makeChat().lastMessage!,
            senderId: 'friend',
            content: '',
            metadata: {
              attachment: {
                type: 'voice',
                mimeType: 'audio/webm',
                url: '/uploads/voice.webm',
              },
            },
          },
          lastMessageSenderName: 'Dmitry Arkaim',
        })}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByText('Dmitry A: Голосовое сообщение')).toBeInTheDocument();
  });

  it('shows file fallback when the last message has file metadata', () => {
    setMe();

    render(
      <ChatListItem
        chat={makeChat({
          lastMessage: {
            ...makeChat().lastMessage!,
            content: '',
            metadata: {
              attachments: [
                {
                  type: 'file',
                  fileName: 'report.pdf',
                  url: '/uploads/report.pdf',
                },
              ],
            },
          },
        })}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByText('Вы: Файл')).toBeInTheDocument();
  });

  it('does not inject an app-logo avatar for news channels without a custom avatar', () => {
    setMe();

    render(
      <ChatListItem
        chat={makeChat({
          type: 'channel',
          name: 'Новости игры',
          channelSlug: 'news',
          avatarUrl: null,
          dmCounterpart: null,
          memberCount: 15,
          lastMessage: null,
          lastMessageSenderName: null,
        })}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.queryByRole('img')).toBeNull();
    expect(document.querySelector('.lucide-megaphone')).not.toBeNull();
  });

  it('shows unread badge from live unread store while the REST chat row is stale', () => {
    setMe();
    useChatStore.getState().setUnread({ 'chat-1': 1 });

    render(<ChatListItem chat={makeChat({ unreadCount: 0 })} onOpen={vi.fn()} />);

    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
