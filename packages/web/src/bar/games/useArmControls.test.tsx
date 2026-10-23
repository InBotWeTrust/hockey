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

it('holds support with physical Z while the mouse controls pressure and wrist',()=>{
 vi.useFakeTimers();const send=vi.fn();render(<Harness send={send}/>);
 fireEvent.keyDown(window,{code:'KeyZ',key:'я'});
 expect(send).toHaveBeenLastCalledWith(expect.objectContaining({supportHeld:true,pressing:false}));
 pointer('pointerDown','pressure',2);pointer('pointerMove','pressure',2,120);
 act(()=>vi.advanceTimersByTime(100));
 expect(send).toHaveBeenLastCalledWith(expect.objectContaining({supportHeld:true,pressing:true,wrist:'inside'}));
 fireEvent.keyUp(window,{code:'KeyZ'});act(()=>vi.advanceTimersByTime(100));
 expect(send).toHaveBeenLastCalledWith(expect.objectContaining({supportHeld:false,pressing:true}));
});

it('keeps pointer support after Z release and clears keyboard support when disabled',()=>{
 vi.useFakeTimers();const send=vi.fn();const view=render(<Harness send={send}/>);
 pointer('pointerDown','support',1);fireEvent.keyDown(window,{code:'KeyZ'});
 fireEvent.keyUp(window,{code:'KeyZ'});act(()=>vi.advanceTimersByTime(100));
 expect(send).toHaveBeenLastCalledWith(expect.objectContaining({supportHeld:true}));
 pointer('pointerUp','support',1);fireEvent.keyDown(window,{code:'KeyZ'});
 view.rerender(<Harness send={send} disabled/>);act(()=>vi.advanceTimersByTime(100));
 expect(send).toHaveBeenLastCalledWith(expect.objectContaining({supportHeld:false,pressing:false}));
 send.mockClear();fireEvent.keyDown(window,{code:'KeyZ'});act(()=>vi.advanceTimersByTime(300));
 expect(send).not.toHaveBeenCalled();
});

it('does not capture Z when typing and releases keyboard support on blur',()=>{
 vi.useFakeTimers();const send=vi.fn();render(<><input aria-label="Chat"/><Harness send={send}/></>);
 fireEvent.keyDown(screen.getByRole('textbox'),{code:'KeyZ'});
 fireEvent.keyDown(window,{code:'KeyZ',ctrlKey:true});expect(send).not.toHaveBeenCalled();
 fireEvent.keyDown(window,{code:'KeyZ'});fireEvent.blur(window);act(()=>vi.advanceTimersByTime(100));
 expect(send).toHaveBeenLastCalledWith(expect.objectContaining({supportHeld:false,pressing:false}));
});
