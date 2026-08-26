import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ChannelPostEditorSheet } from '../components/ChannelPostEditorSheet.js';

describe('ChannelPostEditorSheet', () => {
  it('asks for confirmation before deleting a post', () => {
    const onDelete = vi.fn();
    render(
      <ChannelPostEditorSheet
        post={{ id: 'post-1', content: '**Текст**' }}
        onSave={() => undefined}
        onDelete={onDelete}
        onClose={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Удалить пост' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Подтверждение удаления поста' });
    expect(dialog).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }));
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Удалить пост' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Удалить' }),
    );
    expect(onDelete).toHaveBeenCalledWith('post-1');
  });
});
