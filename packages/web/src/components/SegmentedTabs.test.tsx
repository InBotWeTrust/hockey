import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SegmentedTabs } from './SegmentedTabs.js';

describe('SegmentedTabs', () => {
  const vibrate = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    Object.defineProperty(window.navigator, 'vibrate', { configurable: true, value: vibrate });
  });

  it('uses selection feedback only when switching to another tab', () => {
    const onChange = vi.fn();
    render(
      <SegmentedTabs
        items={[
          { id: 'tasks', label: 'Задания' },
          { id: 'challenges', label: 'Челленджи' },
        ]}
        activeTab="tasks"
        ariaLabel="Разделы"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Задания' }));
    expect(vibrate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('tab', { name: 'Челленджи' }));
    expect(vibrate).toHaveBeenCalledWith(8);
    expect(onChange).toHaveBeenCalledWith('challenges');
  });
});
