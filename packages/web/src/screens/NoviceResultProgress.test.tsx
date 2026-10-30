import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NoviceResultProgress } from './NoviceResultProgress.js';
beforeEach(() => {
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout','requestAnimationFrame','cancelAnimationFrame','performance']});
  vi.stubGlobal('matchMedia', vi.fn(() => ({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()})));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('pauses then animates both numbers and the bar together from the previous period total', () => {
  render(<NoviceResultProgress goals={42} target={100} periodGoals={12}/>);
  const bar=screen.getByRole('progressbar');
  expect(screen.getByText('30/100')).toBeInTheDocument();
  act(()=>vi.advanceTimersByTime(199));
  expect(bar.firstElementChild).toHaveStyle({width:'30%'});
  act(()=>vi.advanceTimersByTime(351));
  const count=Number(screen.getByText(/\/100$/).textContent?.split('/')[0]);
  expect(count).toBeGreaterThan(30);
  expect(count).toBeLessThan(42);
  expect(screen.getByText(`осталось шайб: ${100-count}`)).toBeInTheDocument();
  act(()=>vi.advanceTimersByTime(500));
  expect(screen.getByText('42/100')).toBeInTheDocument();
  expect(bar.firstElementChild).toHaveStyle({width:'42%'});
});
it('shows the confirmed result immediately with reduced motion', () => {
  vi.mocked(window.matchMedia).mockReturnValue({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()} as unknown as MediaQueryList);
  render(<NoviceResultProgress goals={42} target={100} periodGoals={12}/>);
  expect(screen.getByText('42/100')).toBeInTheDocument();
  expect(screen.getByText('осталось шайб: 58')).toBeInTheDocument();
});
it('caps qualification at the threshold and stops animation on unmount', () => {
  const view=render(<NoviceResultProgress goals={105} target={100} periodGoals={10}/>);
  expect(screen.getByText('95/100')).toBeInTheDocument();
  act(()=>vi.advanceTimersByTime(1000));
  expect(screen.getByText('100/100')).toBeInTheDocument();
  expect(screen.getByText('осталось шайб: 0')).toBeInTheDocument();
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
it('does not restart on parent updates and cancels pending frames when closed', () => {
  const view=render(<NoviceResultProgress goals={42} target={100} periodGoals={12}/>);
  act(()=>vi.advanceTimersByTime(500));
  const current=screen.getByText(/\/100$/).textContent;
  view.rerender(<NoviceResultProgress goals={42} target={100} periodGoals={12}/>);
  expect(screen.getByText(/\/100$/).textContent).toBe(current);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
it('flashes only after the progress reaches its final value', () => {
  const view=render(<NoviceResultProgress goals={42} target={100} periodGoals={12}/>);
  const bar=screen.getByRole('progressbar');
  act(()=>vi.advanceTimersByTime(500));
  expect(bar).not.toHaveClass('novice-result-progress--settled');
  act(()=>vi.advanceTimersByTime(500));
  expect(bar).toHaveClass('novice-result-progress--settled');
  view.rerender(<NoviceResultProgress goals={42} target={100} periodGoals={12}/>);
  expect(bar).toHaveClass('novice-result-progress--settled');
});
