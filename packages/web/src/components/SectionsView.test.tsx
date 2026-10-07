import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SectionsView } from './SectionsView.js';
describe('SectionsView', () => {
  it('switches both ways without navigating away from the sections screen', () => {
    render(<SectionsView initialMap map={<p>Map content</p>} cards={<p>Original cards</p>} />);
    expect(screen.getByText('Map content')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Карточки' }));
    expect(screen.getByText('Original cards')).toBeVisible();
    expect(screen.queryByText('Map content')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Карта' }));
    expect(screen.getByText('Map content')).toBeVisible();
  });
});
