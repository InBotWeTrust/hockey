import { fireEvent, render, screen } from '@testing-library/react';
import { LocalPreviewThemeSwitch } from './LocalPreviewThemeSwitch.js';

it('changes the preview theme and URL without reloading or touching account preferences', () => {
  document.documentElement.dataset.theme = 'light';
  history.replaceState(null, '', '/section-panoramas-qa.html?scene=apartment&theme=light');
  render(<LocalPreviewThemeSwitch />);
  fireEvent.click(screen.getByRole('button', { name: 'Тёмная' }));
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(new URL(location.href).searchParams.get('scene')).toBe('apartment');
  expect(new URL(location.href).searchParams.get('theme')).toBe('dark');
  expect(screen.getByRole('button', { name: 'Тёмная' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Светлая' }));
  expect(document.documentElement.dataset.theme).toBe('light');
});
