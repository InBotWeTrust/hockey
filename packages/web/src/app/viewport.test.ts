import { afterEach, describe, expect, it, vi } from 'vitest';
import { installAppViewport } from './viewport.js';

let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('style');
  document.documentElement.classList.remove('app-keyboard-open');
});
function viewport(height = 784, offsetTop = 0, scale = 1) {
  const vv = Object.assign(new EventTarget(), { height, offsetTop, scale });
  vi.stubGlobal('visualViewport', vv);
  vi.stubGlobal('innerHeight', 844);
  return vv;
}
const height = () => document.documentElement.style.getPropertyValue('--app-viewport-height');
const top = () => document.documentElement.style.getPropertyValue('--app-viewport-top');
describe('application viewport', () => {
  it('fills the dynamic viewport despite a smaller resting visual viewport', () => {
    viewport();
    stop = installAppViewport();
    expect(height()).toBe('100dvh');
    expect(top()).toBe('0px');
  });
  it('follows keyboard panning and restores full height after closing', () => {
    const vv = viewport(400, 120);
    stop = installAppViewport();
    expect(height()).toBe('400px');
    expect(top()).toBe('120px');
    vv.offsetTop = 180;
    vv.dispatchEvent(new Event('scroll'));
    expect(top()).toBe('180px');
    vv.height = 784; vv.offsetTop = 0;
    vv.dispatchEvent(new Event('resize'));
    expect(height()).toBe('100dvh');
    expect(top()).toBe('0px');
  });
  it('refreshes after returning from the background with no resize event', () => {
    const vv = viewport(400, 100);
    stop = installAppViewport();
    vv.height = 844; vv.offsetTop = 0;
    window.dispatchEvent(new Event('pageshow'));
    expect(height()).toBe('100dvh');
    expect(top()).toBe('0px');
  });
  it('does not mistake zoom for the keyboard', () => {
    viewport(400, 100, 2);
    stop = installAppViewport();
    expect(height()).toBe('100dvh');
    expect(top()).toBe('0px');
  });
  it('supports browsers without visualViewport', () => {
    vi.stubGlobal('visualViewport', undefined);
    stop = installAppViewport();
    expect(height()).toBe('100dvh');
    expect(top()).toBe('0px');
  });
  it('refreshes visibility and orientation changes', () => {
    const vv = viewport(400, 100);
    stop = installAppViewport();
    vv.height = 844; vv.offsetTop = 0;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(height()).toBe('100dvh');
    vv.height = 400; vv.offsetTop = 90;
    window.dispatchEvent(new Event('orientationchange'));
    expect(height()).toBe('400px');
    expect(top()).toBe('90px');
  });
  it('removes lifecycle listeners on cleanup', () => {
    const vv = viewport(400, 100);
    stop = installAppViewport(); stop();
    vv.height = 844; vv.offsetTop = 0;
    vv.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('pageshow'));
    expect(height()).toBe('400px');
  });
});
