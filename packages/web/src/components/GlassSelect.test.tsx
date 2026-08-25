import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GlassSelect } from './GlassSelect.js';

describe('GlassSelect', () => {
  it('supports listbox keyboard navigation without moving focus into the portal', () => {
    const onChange = vi.fn();
    render(
      <GlassSelect
        ariaLabel="Период"
        value="30d"
        options={[
          { value: '7d', label: '7 дней' },
          { value: '30d', label: '30 дней' },
          { value: '90d', label: '90 дней' },
        ]}
        onChange={onChange}
      />,
    );

    const combobox = screen.getByRole('combobox', { name: 'Период' });
    combobox.focus();
    fireEvent.keyDown(combobox, { key: 'ArrowDown' });

    const listbox = screen.getByRole('listbox', { name: 'Период' });
    expect(combobox).toHaveAttribute('aria-controls', listbox.id);
    expect(combobox).toHaveAttribute('aria-activedescendant');
    expect(combobox).toHaveFocus();

    fireEvent.keyDown(combobox, { key: 'End' });
    expect(screen.getByRole('option', { name: '90 дней' })).toHaveAttribute('data-active', 'true');
    fireEvent.keyDown(combobox, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('90d');
    expect(screen.queryByRole('listbox', { name: 'Период' })).not.toBeInTheDocument();
    expect(combobox).toHaveFocus();
  });

  it('opens upward, selects with Enter and closes with Escape', () => {
    const onChange = vi.fn();
    render(
      <GlassSelect
        ariaLabel="Размер"
        value="4"
        options={[
          { value: '2', label: '2 игрока' },
          { value: '4', label: '4 игрока' },
          { value: '8', label: '8 игроков' },
        ]}
        onChange={onChange}
      />,
    );

    const combobox = screen.getByRole('combobox', { name: 'Размер' });
    fireEvent.keyDown(combobox, { key: 'ArrowUp' });
    fireEvent.keyDown(combobox, { key: 'Home' });
    fireEvent.keyDown(combobox, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('2');

    fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox', { name: 'Размер' })).toBeInTheDocument();
    fireEvent.keyDown(combobox, { key: 'Escape' });
    expect(screen.queryByRole('listbox', { name: 'Размер' })).not.toBeInTheDocument();
  });
});
