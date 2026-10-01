import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FittedNotice } from './FittedNotice.js';

afterEach(() => { vi.restoreAllMocks(); });

it.each([[300, 240, '12px'], [200, 240, '10px']])(
  'fits text in the available menu width %s before shrinking it', (available, natural, size) => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(available as number);
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(natural as number);
    render(<FittedNotice fit className="notice">Лёд тает · игрок −10% · шайба −10%</FittedNotice>);
    expect(screen.getByRole('status').querySelector('span')).toHaveStyle({ fontSize: size });
  },
);
