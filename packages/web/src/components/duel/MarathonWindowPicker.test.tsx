import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { MarathonWindowPicker } from './MarathonWindowPicker.js';
it('permits both search variants and keeps at least one selected',()=> {
  const onChange=vi.fn();
  const view=render(<MarathonWindowPicker multiple selected={[7000]} onChange={onChange}/>);
  fireEvent.click(screen.getByRole('button',{name:/4 сек/}));
  expect(onChange).toHaveBeenLastCalledWith([7000,4000]);
  view.rerender(<MarathonWindowPicker multiple selected={[4000]} onChange={onChange}/>);
  onChange.mockClear();
  fireEvent.click(screen.getByRole('button',{name:/4 сек/}));
  expect(onChange).not.toHaveBeenCalled();
});
it('invites with one concrete window',()=> {
  const onChange=vi.fn();
  render(<MarathonWindowPicker selected={[7000]} onChange={onChange}/>);
  fireEvent.click(screen.getByRole('button',{name:/4 сек/}));
  expect(onChange).toHaveBeenCalledWith([4000]);
});
