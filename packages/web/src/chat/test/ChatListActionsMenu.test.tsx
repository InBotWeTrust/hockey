import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChatListActionsMenu } from '../components/ChatListActionsMenu.js';

function makeRect(): DOMRect {
  return {
    x: 20,
    y: 20,
    top: 20,
    left: 20,
    right: 220,
    bottom: 72,
    width: 200,
    height: 52,
    toJSON: () => ({}),
  };
}

describe('ChatListActionsMenu', () => {
  it('shows the channel notification action and calls toggle', () => {
    const onToggleNotifications = vi.fn();

    render(
      <ChatListActionsMenu
        open
        anchorRect={makeRect()}
        isPinned={false}
        showPinAction={false}
        showNotificationAction
        notificationsMuted={false}
        onTogglePin={vi.fn()}
        onToggleNotifications={onToggleNotifications}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('menuitem', { name: 'Выключить уведомления' }));

    expect(onToggleNotifications).toHaveBeenCalledTimes(1);
  });
});
