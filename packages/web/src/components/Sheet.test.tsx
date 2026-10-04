import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Sheet, shouldDismissSheet } from './Sheet.js';

describe('Sheet', () => {
  it.each([true, false])(
    'respects dismissible=%s for a downward drag on the handle',
    async (dismissible) => {
      const onRequestClose = vi.fn();
      render(
        <Sheet
          open
          title="Профиль"
          dragHandleOnly
          dismissible={dismissible}
          grabberPlacement="top"
          onRequestClose={onRequestClose}
        >
          <button type="button">Действие</button>
        </Sheet>,
      );
      await waitFor(() => expect(screen.getByRole('button', { name: 'Действие' })).toHaveFocus());
      const pointer = { pointerType: 'touch', pointerId: 1, isPrimary: true, button: 0 };
      fireEvent.pointerDown(document.querySelector('.sheet-drag-handle') as HTMLElement, {
        ...pointer,
        clientX: 100,
        clientY: 100,
      });
      fireEvent.pointerMove(window, { ...pointer, clientX: 100, clientY: 250 });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      fireEvent.pointerUp(window, { ...pointer, clientX: 100, clientY: 250 });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      if (dismissible) expect(onRequestClose).toHaveBeenCalledWith('drag');
      else expect(onRequestClose).not.toHaveBeenCalled();
    },
  );

  it('does not start a sheet drag from its action button in handle-only mode', async () => {
    const onRequestClose = vi.fn();
    const onClick = vi.fn();
    render(
      <Sheet
        open
        title="Профиль"
        dragHandleOnly
        grabberPlacement="top"
        onRequestClose={onRequestClose}
      >
        <button type="button" onClick={onClick}>
          Вызвать на дуэль
        </button>
      </Sheet>,
    );
    const action = screen.getByRole('button', { name: 'Вызвать на дуэль' });
    await waitFor(() => expect(action).toHaveFocus());
    const pointer = { pointerType: 'touch', pointerId: 1, isPrimary: true, button: 0 };
    fireEvent.pointerDown(action, { ...pointer, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { ...pointer, clientX: 100, clientY: 250 });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    fireEvent.pointerUp(window, { ...pointer, clientX: 100, clientY: 250 });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(onRequestClose).not.toHaveBeenCalled();
    fireEvent.click(action);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog').style.touchAction).toBe('pan-y');
  });

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
