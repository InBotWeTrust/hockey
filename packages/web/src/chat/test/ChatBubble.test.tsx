import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChatBubble } from '../components/ChatBubble.js';
import type { ChatMessageDTO } from '../api.js';

const baseMessage: ChatMessageDTO = {
  id: 'm1',
  chatId: 'c1',
  senderId: 'u1',
  senderDisplayName: 'Иван',
  senderAvatarUrl: null,
  content: 'привет',
  replyToId: null,
  isDeleted: false,
  createdAt: '2026-04-27T10:00:00.000Z',
  reactions: [],
};

function defaults() {
  return {
    message: baseMessage,
    isOwn: false,
    showAuthor: true,
    replyTo: null,
    onRequestActions: vi.fn(),
    onReact: vi.fn(),
  };
}

describe('ChatBubble — author tap', () => {
  it('renders message time inside the bubble surface', () => {
    render(<ChatBubble {...defaults()} />);

    const expectedTime = new Date(baseMessage.createdAt).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const time = screen.getByText(expectedTime);

    expect(time.closest('time')).not.toBeNull();
    expect(time.closest('.glass')).not.toBeNull();
    expect(time.closest('time')).toHaveStyle({ position: 'absolute' });
  });

  it('renders delivered and read indicators next to own message time', () => {
    const { rerender } = render(<ChatBubble {...defaults()} isOwn deliveryStatus="delivered" />);

    expect(screen.getByLabelText('Доставлено')).toBeInTheDocument();

    rerender(<ChatBubble {...defaults()} isOwn deliveryStatus="read" />);
    expect(screen.getByLabelText('Прочитано')).toBeInTheDocument();
    expect(screen.queryByLabelText('Доставлено')).toBeNull();
  });

  it('shows an edited marker for changed non-deleted messages', () => {
    render(<ChatBubble {...defaults()} message={{ ...baseMessage, isEdited: true }} />);
    expect(screen.getByText('изменено')).toBeInTheDocument();
  });

  it('clicking the author name calls onOpenProfile with sender info', () => {
    const onOpenProfile = vi.fn();
    render(<ChatBubble {...defaults()} onOpenProfile={onOpenProfile} />);
    const nameBtn = screen.getByRole('button', { name: 'Профиль: Иван' });
    fireEvent.click(nameBtn);
    expect(onOpenProfile).toHaveBeenCalledWith({
      userId: 'u1',
      displayName: 'Иван',
      avatarUrl: null,
    });
  });

  it('renders disabled author button when senderDisplayName is null', () => {
    render(
      <ChatBubble
        {...defaults()}
        message={{ ...baseMessage, senderDisplayName: null }}
        onOpenProfile={vi.fn()}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Профиль: Участник' });
    expect(btn).toBeDisabled();
  });

  it('does not render author UI when isOwn=true', () => {
    render(<ChatBubble {...defaults()} isOwn onOpenProfile={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Профиль: Иван' })).toBeNull();
    expect(screen.queryByText('Иван')).toBeNull();
  });

  it('does not render author UI when showAuthor=false', () => {
    render(<ChatBubble {...defaults()} showAuthor={false} onOpenProfile={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Профиль: Иван' })).toBeNull();
    expect(screen.queryByText('Иван')).toBeNull();
  });
});
