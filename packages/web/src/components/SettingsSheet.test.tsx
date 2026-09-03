import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsSheet } from './SettingsSheet.js';

describe('SettingsSheet', () => {
  it('uses the shared modal header and dismissal behavior', () => {
    const onClose = vi.fn();
    render(
      <SettingsSheet open title="Настройки интерфейса" onClose={onClose}>
        <button type="button">Сохранить</button>
      </SettingsSheet>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Настройки интерфейса' });
    expect(dialog).toHaveClass('modal-card');
    expect(
      screen
        .getByRole('heading', { name: 'Настройки интерфейса' })
        .parentElement?.querySelector(':scope > button[aria-label="Закрыть"]'),
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
