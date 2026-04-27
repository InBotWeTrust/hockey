import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { HighlightedText } from '../components/HighlightedText.js';

describe('HighlightedText', () => {
  it('wraps a single matching token in <mark>', () => {
    const { container } = render(<HighlightedText text="hello world" tokens={['world']} />);
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0]!.textContent).toBe('world');
  });

  it('wraps multiple tokens, preserving original casing', () => {
    const { container } = render(
      <HighlightedText text="The Quick Brown Fox" tokens={['quick', 'fox']} />,
    );
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(2);
    expect(marks[0]!.textContent).toBe('Quick');
    expect(marks[1]!.textContent).toBe('Fox');
  });

  it('renders the text unchanged when token list is empty', () => {
    const { container } = render(<HighlightedText text="plain text" tokens={[]} />);
    expect(container.querySelectorAll('mark')).toHaveLength(0);
    expect(container.textContent).toBe('plain text');
  });

  it('treats regex metacharacters as literals', () => {
    const { container } = render(<HighlightedText text="a.b c.d" tokens={['.']} />);
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(2);
    expect(marks[0]!.textContent).toBe('.');
  });

  it('renders script-tag-like text as literal text, not as a parsed element', () => {
    const { container } = render(
      <HighlightedText text={'<script>alert(1)</script>'} tokens={['alert']} />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toBe('<script>alert(1)</script>');
    expect(container.querySelector('mark')!.textContent).toBe('alert');
  });
});
