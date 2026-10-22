import { fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WeatherOverlay } from './WeatherOverlay.js';
afterEach(() => {
  vi.restoreAllMocks();
});
it('draws rain and sleet with bounded canvas resolution and stops while hidden', () => {
  const context = {
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    globalAlpha: 1,
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    lineCap: 'round',
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
  const next = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(3);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 360,
    height: 800,
  } as DOMRect);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const motion = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.spyOn(window, 'matchMedia').mockReturnValue(motion as unknown as MediaQueryList);
  const view = render(<WeatherOverlay weather="rain" />);
  const canvas = view.container.querySelector('canvas')!;
  expect(canvas.width).toBe(540);
  expect(canvas.height).toBe(1200);
  expect(context.stroke).toHaveBeenCalled();
  expect(next).toHaveBeenCalled();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  fireEvent(document, new Event('visibilitychange'));
  expect(cancel).toHaveBeenCalled();
  expect(view.container.querySelector('[data-paused="true"]')).not.toBeNull();
  view.rerender(<WeatherOverlay weather="sleet" />);
  expect(view.container.querySelector('[data-weather="sleet"] canvas')).not.toBeNull();
  view.unmount();
  expect(motion.removeEventListener).toHaveBeenCalled();
});
it('renders precipitation without animation when reduced motion is requested', () => {
  const context = {
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const next = vi.spyOn(window, 'requestAnimationFrame');
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList);
  const view = render(<WeatherOverlay weather="rain" />);
  expect(context.stroke).toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
  view.unmount();
});
