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

function pointer(target: Element | Document, type: string, x: number, pointerType = 'mouse'): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerId: 1, pointerType, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: 10 });
  fireEvent(target, event);
}

it('drags overflow filters with a mouse without selecting a tab, then permits ordinary clicks', () => {
  const onChange = vi.fn();
  render(<SegmentedTabs scrollable items={[{id:'one',label:'Первый'},{id:'two',label:'Второй'}]} activeTab="one" ariaLabel="Фильтры" onChange={onChange} />);
  const row = screen.getByRole('tablist');
  Object.defineProperties(row, {clientWidth:{configurable:true,value:100},scrollWidth:{configurable:true,value:400}});
  fireEvent(window, new Event('resize'));
  const tab = screen.getByRole('tab', {name:'Второй'});
  pointer(tab,'pointerdown',180); pointer(document,'pointermove',90); pointer(document,'pointerup',90);
  expect(row.scrollLeft).toBe(90);
  fireEvent.click(tab, {detail:1}); expect(onChange).not.toHaveBeenCalled();
  pointer(tab,'pointerdown',90); pointer(document,'pointerup',90);
  fireEvent.click(tab, {detail:1}); expect(onChange).toHaveBeenCalledWith('two');
});

it('leaves touch gestures native and does not drag a row that fits', () => {
  render(<SegmentedTabs scrollable items={[{id:'one',label:'Первый'}]} activeTab="one" ariaLabel="Фильтры" onChange={vi.fn()} />);
  const row=screen.getByRole('tablist');
  Object.defineProperties(row,{clientWidth:{configurable:true,value:100},scrollWidth:{configurable:true,value:400}});
  pointer(row,'pointerdown',180,'touch');pointer(document,'pointermove',90,'touch');pointer(document,'pointerup',90,'touch');
  expect(row.scrollLeft).toBe(0);
  Object.defineProperty(row,'scrollWidth',{configurable:true,value:100});
  pointer(row,'pointerdown',180);pointer(document,'pointermove',90);pointer(document,'pointerup',90);
  expect(row.scrollLeft).toBe(0);
});

it('shows navigation arrows only for hidden content and updates them at the edges', () => {
  render(<SegmentedTabs scrollable items={[{id:'one',label:'Первый'}]} activeTab="one" ariaLabel="Фильтры" onChange={vi.fn()} />);
  const row=screen.getByRole('tablist');
  Object.defineProperties(row,{clientWidth:{configurable:true,value:100},scrollWidth:{configurable:true,value:400}});
  fireEvent(window,new Event('resize'));
  expect(screen.queryByRole('button',{name:'Фильтры: прокрутить влево'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Фильтры: прокрутить вправо'}));
  expect(row.scrollLeft).toBeGreaterThan(0);
  row.scrollLeft=300;fireEvent.scroll(row);
  expect(screen.queryByRole('button',{name:'Фильтры: прокрутить вправо'})).toBeNull();
  expect(screen.getByRole('button',{name:'Фильтры: прокрутить влево'})).toBeInTheDocument();
});
