import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useLongPress } from '../useLongPress.js';

function Probe(props: { onLongPress: (rect: DOMRect) => void; delayMs?: number }): JSX.Element {
  const handlers = useLongPress(props.onLongPress, { delayMs: props.delayMs ?? 500 });
  return (
    <div data-testid="target" {...handlers} style={{ width: 100, height: 50 }}>
      hold me
    </div>
  );
}

const pointerDown = (target: HTMLElement, x = 10, y = 10): void => {
  fireEvent.pointerDown(target, { pointerId: 1, clientX: x, clientY: y, isPrimary: true });
};
const pointerUp = (target: HTMLElement, x = 10, y = 10): void => {
  fireEvent.pointerUp(target, { pointerId: 1, clientX: x, clientY: y });
};
const pointerMove = (target: HTMLElement, x: number, y: number): void => {
  fireEvent.pointerMove(target, { pointerId: 1, clientX: x, clientY: y });
};
const pointerCancel = (target: HTMLElement): void => {
  fireEvent.pointerCancel(target, { pointerId: 1 });
};

describe('useLongPress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires the callback after delayMs of stationary press', () => {
    const cb = vi.fn();
    render(<Probe onLongPress={cb} />);
    const target = screen.getByTestId('target');
    pointerDown(target);
    vi.advanceTimersByTime(499);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('passes the bounding rect of the target as the callback argument', () => {
    const cb = vi.fn();
    render(<Probe onLongPress={cb} />);
    const target = screen.getByTestId('target');
    pointerDown(target);
    vi.advanceTimersByTime(500);
    expect(cb).toHaveBeenCalledTimes(1);
    const arg = cb.mock.calls[0]?.[0];
    expect(arg).toBeDefined();
    expect(typeof (arg as DOMRect).top).toBe('number');
  });

  it('cancels when the pointer moves more than 5 px', () => {
    const cb = vi.fn();
    render(<Probe onLongPress={cb} />);
    const target = screen.getByTestId('target');
    pointerDown(target, 10, 10);
    pointerMove(target, 20, 10);
    vi.advanceTimersByTime(600);
    expect(cb).not.toHaveBeenCalled();
  });

  it('does not cancel for sub-threshold jitter (<= 5 px)', () => {
    const cb = vi.fn();
    render(<Probe onLongPress={cb} />);
    const target = screen.getByTestId('target');
    pointerDown(target, 10, 10);
    pointerMove(target, 13, 12);
    vi.advanceTimersByTime(500);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('cancels on early pointer up', () => {
    const cb = vi.fn();
    render(<Probe onLongPress={cb} />);
    const target = screen.getByTestId('target');
    pointerDown(target);
    vi.advanceTimersByTime(300);
    pointerUp(target);
    vi.advanceTimersByTime(300);
    expect(cb).not.toHaveBeenCalled();
  });

  it('cancels on pointer cancel (e.g. browser scroll takes over)', () => {
    const cb = vi.fn();
    render(<Probe onLongPress={cb} />);
    const target = screen.getByTestId('target');
    pointerDown(target);
    pointerCancel(target);
    vi.advanceTimersByTime(600);
    expect(cb).not.toHaveBeenCalled();
  });

  it('respects a custom delayMs', () => {
    const cb = vi.fn();
    render(<Probe onLongPress={cb} delayMs={250} />);
    const target = screen.getByTestId('target');
    pointerDown(target);
    vi.advanceTimersByTime(249);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('only fires once per press (re-press required)', () => {
    const cb = vi.fn();
    render(<Probe onLongPress={cb} />);
    const target = screen.getByTestId('target');
    pointerDown(target);
    vi.advanceTimersByTime(500);
    vi.advanceTimersByTime(500); // no second fire from a single press
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
