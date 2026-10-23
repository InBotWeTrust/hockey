import {act, cleanup, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {CityBackground} from './CityBackground.js';

const originalDecode = Object.getOwnPropertyDescriptor(Image.prototype, 'decode');
beforeEach(() => {Object.defineProperty(Image.prototype, 'decode', {configurable: true, writable: true, value: () => Promise.resolve()});});
afterEach(() => {cleanup();vi.restoreAllMocks();if (originalDecode) Object.defineProperty(Image.prototype, 'decode', originalDecode);else Reflect.deleteProperty(Image.prototype, 'decode');});

it('reuses the decoded map after leaving the rink without progressive image painting', async () => {
  let complete!: () => void;
  const decode = vi.spyOn(Image.prototype, 'decode').mockImplementation(() => new Promise<void>(resolve => {complete = resolve;}));
  const view = render(<CityBackground image="/maps/return-test.webp"/>);
  expect(screen.queryByAltText('Зимний хоккейный район')).not.toBeInTheDocument();
  await act(async () => {complete();});
  expect(screen.getByAltText('Зимний хоккейный район')).toHaveAttribute('decoding', 'sync');
  view.unmount();
  render(<CityBackground image="/maps/return-test.webp"/>);
  expect(screen.getByAltText('Зимний хоккейный район')).toBeInTheDocument();
  expect(decode).toHaveBeenCalledTimes(1);
});

it('keeps the previous map until the next lighting image finishes decoding', async () => {
  const pending: Array<() => void> = [];
  vi.spyOn(Image.prototype, 'decode').mockImplementation(() => new Promise<void>(resolve => {pending.push(resolve);}));
  const view = render(<CityBackground image="/maps/first-test.webp"/>);
  await act(async () => {pending.shift()!();});
  view.rerender(<CityBackground image="/maps/next-test.webp"/>);
  expect(screen.getByAltText('Зимний хоккейный район')).toHaveAttribute('src', '/maps/first-test.webp');
  await act(async () => {pending.shift()!();});
  expect(screen.getByAltText('Зимний хоккейный район')).toHaveAttribute('src', '/maps/next-test.webp');
});

it('ignores a superseded lighting request', async () => {
  const pending: Array<() => void> = [];
  vi.spyOn(Image.prototype, 'decode').mockImplementation(() => new Promise<void>(resolve => {pending.push(resolve);}));
  const view = render(<CityBackground image="/maps/slow-test.webp"/>);
  view.rerender(<CityBackground image="/maps/latest-test.webp"/>);
  await act(async () => {pending[1]!();});
  await act(async () => {pending[0]!();});
  expect(screen.getByAltText('Зимний хоккейный район')).toHaveAttribute('src', '/maps/latest-test.webp');
});

it('retains the usable map on failure and retries on app return', async () => {
  const decode = vi.spyOn(Image.prototype, 'decode').mockResolvedValue(undefined);
  const view = render(<CityBackground image="/maps/usable-test.webp"/>);
  await act(async () => {});
  decode.mockRejectedValueOnce(new Error('offline'));
  view.rerender(<CityBackground image="/maps/retry-test.webp"/>);
  await act(async () => {});
  expect(screen.getByAltText('Зимний хоккейный район')).toHaveAttribute('src', '/maps/usable-test.webp');
  await act(async () => {window.dispatchEvent(new Event('focus'));});
  expect(screen.getByAltText('Зимний хоккейный район')).toHaveAttribute('src', '/maps/retry-test.webp');
});
