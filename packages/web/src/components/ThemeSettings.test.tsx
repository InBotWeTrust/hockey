import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ThemeSettings } from './ThemeSettings';
afterEach(() => localStorage.removeItem('hockey.theme'));
it('applies and restores a chosen theme', () => {
  const { unmount } = render(<ThemeSettings />);
  fireEvent.click(screen.getByRole('tab', { name: 'Тёмная' }));
  expect(document.documentElement.dataset.theme).toBe('dark');
  unmount();
  render(<ThemeSettings />);
  expect(screen.getByRole('tab', { name: 'Тёмная' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(screen.getByRole('tab', { name: 'Автоматически' }));
  expect(localStorage.getItem('hockey.theme')).toBe('auto');
});
