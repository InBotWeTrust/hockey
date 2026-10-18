import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { VisitorCardSlot } from './VisitorCardSlot.js';
it('hides an unpurchased card and retains an expired disabled slot', () => {
  const view = render(
    <VisitorCardSlot card={{ purchased: false, active: false, expiresAt: null }} />,
  );
  expect(screen.queryByRole('button')).toBeNull();
  view.rerender(
    <VisitorCardSlot
      card={{ purchased: true, active: false, expiresAt: '2026-10-01T12:00:00Z' }}
    />,
  );
  expect(screen.getByRole('button', { name: /Карта посетителя/ })).toBeDisabled();
});
it('opens active card details without equipping and reactivates the same slot', () => {
  render(
    <VisitorCardSlot card={{ purchased: true, active: true, expiresAt: '2026-11-17T12:00:00Z' }} />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Карта посетителя/ }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText(/Действует до/)).toBeInTheDocument();
  expect(screen.queryByText('Экипировать')).toBeNull();
});
