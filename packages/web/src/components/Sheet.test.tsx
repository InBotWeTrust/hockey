import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Sheet, shouldDismissSheet } from './Sheet.js';

describe('Sheet', () => {
  it('dismisses only for a meaningful downward drag or flick', () => {
    expect(shouldDismissSheet(130, 0)).toBe(true);
    expect(shouldDismissSheet(20, 720)).toBe(true);
    expect(shouldDismissSheet(50, 120)).toBe(false);
    expect(shouldDismissSheet(-40, 900)).toBe(false);
  });

  it('reports backdrop and Escape dismissal through the shared modal contract', async () => {
    const onRequestClose = vi.fn();
    render(
      <Sheet open title="Профиль игрока" onRequestClose={onRequestClose}>
        <button type="button">Написать</button>
      </Sheet>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Профиль игрока' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Написать' })).toHaveFocus());

    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.mouseDown(document.querySelector('.modal-backdrop') as HTMLElement);

    expect(onRequestClose.mock.calls).toEqual([['escape'], ['backdrop']]);
  });

  it('blocks dismissal while an operation is busy', async () => {
    const onRequestClose = vi.fn();
    render(
      <Sheet open title="Сохранение" dismissible={false} onRequestClose={onRequestClose}>
        <button type="button">Ждите</button>
      </Sheet>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Сохранение' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ждите' })).toHaveFocus());

    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.mouseDown(document.querySelector('.modal-backdrop') as HTMLElement);

    expect(onRequestClose).not.toHaveBeenCalled();
  });
});
