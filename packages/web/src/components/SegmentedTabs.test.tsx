import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SegmentedTabs } from './SegmentedTabs.js';

describe('SegmentedTabs', () => {
  const vibrate = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    Object.defineProperty(window.navigator, 'vibrate', { configurable: true, value: vibrate });
  });

  it('switches tabs without physical feedback', () => {
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
    expect(vibrate).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith('challenges');
  });
});
