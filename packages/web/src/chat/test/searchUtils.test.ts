import { describe, expect, it } from 'vitest';
import { excerptAround } from '../searchUtils.js';

describe('excerptAround', () => {
  it('centers excerpt on the first matching token with ellipses on both sides', () => {
    const text =
      'The quick brown fox jumps over the lazy dog and then continues running through the field.';
    const out = excerptAround(text, ['lazy'], 10, 20);
    expect(out).toMatch(/^…/);
    expect(out).toContain('lazy');
    expect(out).toMatch(/…$/);
  });

  it('omits leading ellipsis when match is at the start', () => {
    const out = excerptAround('Hello world from Russia', ['Hello'], 40, 40);
    expect(out.startsWith('…')).toBe(false);
    expect(out).toContain('Hello');
  });

  it('omits trailing ellipsis when match is at the end', () => {
    const out = excerptAround('Short final word', ['word'], 40, 40);
    expect(out.endsWith('…')).toBe(false);
    expect(out).toContain('word');
  });

  it('returns the head of the text when no token matches', () => {
    const text = 'Lorem ipsum dolor sit amet';
    const out = excerptAround(text, ['nope'], 5, 10);
    expect(out).toBe(text.slice(0, 15));
  });

  it('treats matching as case-insensitive', () => {
    const out = excerptAround('Привет, мир!', ['ПРИВЕТ'], 0, 100);
    expect(out).toContain('Привет');
  });

  it('returns the original text when both sides are larger than the text', () => {
    expect(excerptAround('tiny', ['x'], 100, 100)).toBe('tiny');
  });
});
