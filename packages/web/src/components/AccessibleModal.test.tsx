import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AccessibleModal } from './AccessibleModal.js';

function Harness({ closeBlocked = false }: { closeBlocked?: boolean }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <main>
      <button type="button" onClick={() => setOpen(true)}>
        Открыть
      </button>
      <button type="button">Фоновое действие</button>
      {open && (
        <AccessibleModal
          title="Доступный диалог"
          copy="Проверка модального контракта."
          closeBlocked={closeBlocked}
          onClose={() => setOpen(false)}
        >
          <div className="modal-actions">
            <button type="button" onClick={() => setOpen(false)}>
              Отмена
            </button>
            <button type="button">Подтвердить</button>
          </div>
        </AccessibleModal>
      )}
    </main>
  );
}

describe('AccessibleModal', () => {
  it('focuses inside, traps Tab, makes the background inert, and restores the exact trigger', async () => {
    const rendered = render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Открыть' });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Доступный диалог' });
    const cancel = screen.getByRole('button', { name: 'Отмена' });
    const confirm = screen.getByRole('button', { name: 'Подтвердить' });
    await waitFor(() => expect(cancel).toHaveFocus());
    expect(rendered.container).toHaveAttribute('inert');
    expect(rendered.container).toHaveAttribute('aria-hidden', 'true');

    confirm.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(confirm).toHaveFocus();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(rendered.container).not.toHaveAttribute('inert');
    expect(rendered.container).not.toHaveAttribute('aria-hidden');
    expect(trigger).toHaveFocus();
  });

  it('blocks Escape and backdrop dismissal while close is blocked', async () => {
    render(<Harness closeBlocked />);
    fireEvent.click(screen.getByRole('button', { name: 'Открыть' }));
    const dialog = screen.getByRole('dialog', { name: 'Доступный диалог' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Отмена' })).toHaveFocus());

    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.mouseDown(document.querySelector('.modal-backdrop') as HTMLElement);

    expect(screen.getByRole('dialog', { name: 'Доступный диалог' })).toBeInTheDocument();
  });

  it('reports whether Escape or backdrop requested dismissal', async () => {
    const onRequestClose = vi.fn();
    render(
      <AccessibleModal title="Причина закрытия" onRequestClose={onRequestClose}>
        <button type="button">Действие</button>
      </AccessibleModal>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Причина закрытия' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Действие' })).toHaveFocus());

    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.mouseDown(document.querySelector('.modal-backdrop') as HTMLElement);

    expect(onRequestClose.mock.calls).toEqual([['escape'], ['backdrop']]);
  });
});

it('restores the game and trigger when parent and result modals close together', async () => {
  function NestedHarness(): JSX.Element {
    const [fight, setFight] = useState(false);
    const [result, setResult] = useState(false);
    return <>
      <button onClick={() => setFight(true)}>Start fight</button>
      {fight && <AccessibleModal title="Fight">
        <button onClick={() => setResult(true)}>Show result</button>
        {result && <AccessibleModal title="Result"><button onClick={() => setFight(false)}>Resume game</button></AccessibleModal>}
      </AccessibleModal>}
    </>;
  }
  const view = render(<NestedHarness />);
  const start = screen.getByRole('button', { name: 'Start fight' });
  start.focus(); fireEvent.click(start);
  fireEvent.click(screen.getByRole('button', { name: 'Show result' }));
  fireEvent.click(screen.getByRole('button', { name: 'Resume game' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(view.container).not.toHaveAttribute('inert');
  expect(view.container).not.toHaveAttribute('aria-hidden');
  expect(start).toHaveFocus();
});
