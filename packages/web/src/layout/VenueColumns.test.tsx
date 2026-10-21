import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { VenueColumns } from './VenueColumns.js';
const pages = Array.from({ length: 5 }, (_, index) => ({
  id: String(index),
  label: `Page ${index}`,
  image: '/a.webp',
  render: () => <input aria-label={`Form ${index}`} defaultValue="saved" />,
}));
afterEach(() => { vi.restoreAllMocks(); });
it('renders two independent columns, preserves forms and keeps the selected page visible after resize', () => {
  let width = 834;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ width, height: 800 }) as DOMRect,
  );
  const select = vi.fn();
  const view = render(
    <VenueColumns
      pages={pages}
      selected="0"
      onSelect={select}
      storageKey="column-test"
      dockedChat={false}
    />,
  );
  expect(screen.getByLabelText('Form 0')).toBeVisible();
  expect(screen.getByLabelText('Form 1')).toBeVisible();
  expect(screen.queryByLabelText('Form 4')).toBeNull();
  fireEvent.change(screen.getByLabelText('Form 0'), { target: { value: 'draft' } });
  view.rerender(
    <VenueColumns
      pages={pages}
      selected="4"
      onSelect={select}
      storageKey="column-test"
      dockedChat={false}
    />,
  );
  expect(screen.getByLabelText('Form 4')).toBeVisible();
  expect(screen.getByLabelText('Form 0')).not.toBeVisible();
  view.rerender(
    <VenueColumns
      pages={pages}
      selected="0"
      onSelect={select}
      storageKey="column-test"
      dockedChat={false}
    />,
  );
  expect(screen.getByLabelText('Form 0')).toHaveValue('draft');
  width = 1440;
  fireEvent(window, new Event('resize'));
  expect(screen.getByLabelText('Form 2')).toBeVisible();
  expect(screen.getAllByTestId('venue-column-scroll')).toHaveLength(5);
});
