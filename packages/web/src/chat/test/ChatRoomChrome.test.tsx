import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatRoomHeader } from '../components/ChatRoomHeader.js';
import { ChatRoomSearchBar } from '../components/ChatRoomSearchBar.js';

describe('ChatRoom chrome', () => {
  it('renders separate controls and a compact readable title surface', () => {
    const { container } = render(
      <ChatRoomHeader
        title="Dmitry Arkaim"
        subtitle="был сегодня в 12:59"
        avatarUrl={null}
        onBack={vi.fn()}
        searchOpen
        onToggleSearch={vi.fn()}
      />,
    );

    const header = container.querySelector('.chat-room-header');
    expect(header).toBeInTheDocument();
    expect(header).not.toHaveClass('glass-dock-surface');
    const identity = screen.getByText('Dmitry Arkaim').closest('.chat-room-header__identity');
    expect(identity).toBeInTheDocument();
    expect(identity?.querySelector('.chat-room-header__avatar')).toBeInTheDocument();

    const back = screen.getByRole('button', { name: 'К списку чатов' });
    const search = screen.getByRole('button', { name: 'Закрыть поиск' });
    expect(back).toHaveClass('chat-room-header__control', 'chat-room-header__control--surface');
    expect(search).toHaveClass('chat-room-header__control', 'chat-room-header__control--surface');
  });

  it('uses a compact rounded field for in-chat search', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ChatRoomSearchBar
        open
        value=""
        placeholder="Поиск в чате"
        onChange={onChange}
      />,
    );

    expect(container.querySelector('.chat-room-search')).toBeInTheDocument();
    expect(container.querySelector('.chat-room-search__field')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск по чату' }), {
      target: { value: 'гол' },
    });
    expect(onChange).toHaveBeenCalledWith('гол');
  });
});
