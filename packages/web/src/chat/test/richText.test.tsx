import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RichText, stripRichTextSyntax } from '../richText.js';

describe('RichText', () => {
  it('renders bold and italic markers as safe inline elements', () => {
    render(<RichText text="Патч **усилен** и __ускорен__" />);

    expect(screen.getByText('усилен').tagName).toBe('STRONG');
    expect(screen.getByText('ускорен').tagName).toBe('EM');
  });

  it('keeps unmatched markers as text', () => {
    render(<RichText text="Патч **почти готов" />);

    expect(screen.getByText('Патч **почти готов')).toBeInTheDocument();
  });

  it('strips formatting markers for previews', () => {
    expect(stripRichTextSyntax('**Важное** и __быстрое__')).toBe('Важное и быстрое');
  });
});
