import { act, cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useArmControls } from './useArmControls.js';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function Harness({
  send,
  disabled = false,
}: {
  send: ReturnType<typeof vi.fn>;
  disabled?: boolean;
}) {
  const c = useArmControls({ seq: 0, disabled, send });
  return (
    <>
      <div data-testid="support" {...c.supportHandlers} />
      <div data-testid="pressure" {...c.pressureHandlers} />
      <span>{c.input.wrist}</span>
    </>
  );
}
function pointer(
  type: 'pointerDown' | 'pointerMove' | 'pointerUp' | 'pointerCancel',
  name: string,
  id: number,
  x = 50,
  y = 50,
) {
  const e = createEvent[type](screen.getByTestId(name));
  Object.defineProperties(e, {
    pointerId: { value: id },
    clientX: { value: x },
    clientY: { value: y },
  });
  fireEvent(screen.getByTestId(name), e);
}
it('keeps two fingers independent, retains wrist and releases on blur', () => {
  vi.useFakeTimers();
  const send = vi.fn();
  render(<Harness send={send} />);
  pointer('pointerDown', 'support', 1);
  pointer('pointerDown', 'pressure', 2);
  pointer('pointerMove', 'pressure', 2, 120);
  act(() => vi.advanceTimersByTime(250));
  expect(send).toHaveBeenLastCalledWith(
    expect.objectContaining({ supportHeld: true, pressing: true, wrist: 'inside' }),
  );
  pointer('pointerUp', 'pressure', 2);
  act(() => vi.advanceTimersByTime(100));
  expect(send).toHaveBeenLastCalledWith(
    expect.objectContaining({ supportHeld: true, pressing: false, wrist: 'inside' }),
  );
  fireEvent(window, new Event('blur'));
  act(() => vi.advanceTimersByTime(100));
  expect(send).toHaveBeenLastCalledWith(
    expect.objectContaining({ supportHeld: false, pressing: false }),
  );
});
it('does not move the first finger to a second region and caps rapid input at ten per second', () => {
  vi.useFakeTimers();
  const send = vi.fn();
  render(<Harness send={send} />);
  pointer('pointerDown', 'support', 1);
  pointer('pointerDown', 'pressure', 1);
  for (let i = 0; i < 50; i++) {
    pointer('pointerMove', 'support', 1, 50, i);
    act(() => vi.advanceTimersByTime(10));
  }
  expect(send.mock.calls.length).toBeLessThanOrEqual(6);
  expect(send).toHaveBeenLastCalledWith(
    expect.objectContaining({ supportHeld: true, pressing: false }),
  );
  pointer('pointerCancel', 'support', 1);
  act(() => vi.advanceTimersByTime(100));
  expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ supportHeld: false }));
});
