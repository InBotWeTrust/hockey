import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MessageActionsMenu } from '../components/MessageActionsMenu.js';
import { FAVORITE_EMOJI } from '../reactions.js';

const anchor: DOMRect = {
  top: 100, left: 100, right: 200, bottom: 200, width: 100, height: 100,
  x: 100, y: 100, toJSON: () => ({}),
};

function defaults() {
  return {
    open: true,
    anchorRect: anchor,
    isOwn: true,
    onReply: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onPickEmoji: vi.fn(),
    onMoreEmoji: vi.fn(),
    onClose: vi.fn(),
  };
}

describe('MessageActionsMenu', () => {
  it('renders the 6 favorite emoji shelf and the + button', () => {
    render(<MessageActionsMenu {...defaults()} />);
    for (const e of FAVORITE_EMOJI) {
      expect(screen.getByRole('button', { name: e })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: /ещё реакции/i })).toBeInTheDocument();
  });

  it('still renders Ответить + Редактировать + Удалить for own messages', () => {
    render(<MessageActionsMenu {...defaults()} />);
    expect(screen.getByRole('menuitem', { name: /ответить/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /редактировать/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /удалить/i })).toBeInTheDocument();
  });

  it('hides edit/delete for non-own messages', () => {
    render(<MessageActionsMenu {...defaults()} isOwn={false} />);
    expect(screen.queryByRole('menuitem', { name: /редактировать/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /удалить/i })).not.toBeInTheDocument();
  });

  it('clicking a favorite calls onPickEmoji + onClose', () => {
    const props = defaults();
    render(<MessageActionsMenu {...props} />);
    fireEvent.click(screen.getByRole('button', { name: FAVORITE_EMOJI[0]! }));
    expect(props.onPickEmoji).toHaveBeenCalledWith(FAVORITE_EMOJI[0]);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('clicking + calls onMoreEmoji (parent decides what to do with the menu)', () => {
    const props = defaults();
    render(<MessageActionsMenu {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /ещё реакции/i }));
    expect(props.onMoreEmoji).toHaveBeenCalled();
  });

  it('clicking Ответить calls onReply + onClose', () => {
    const props = defaults();
    render(<MessageActionsMenu {...props} />);
    fireEvent.click(screen.getByRole('menuitem', { name: /ответить/i }));
    expect(props.onReply).toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it('clicking Удалить calls onDelete + onClose', () => {
    const props = defaults();
    render(<MessageActionsMenu {...props} />);
    fireEvent.click(screen.getByRole('menuitem', { name: /удалить/i }));
    expect(props.onDelete).toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it('clicking Редактировать calls onEdit + onClose', () => {
    const props = defaults();
    render(<MessageActionsMenu {...props} />);
    fireEvent.click(screen.getByRole('menuitem', { name: /редактировать/i }));
    expect(props.onEdit).toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });
});
