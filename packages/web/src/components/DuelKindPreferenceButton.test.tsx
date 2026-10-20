import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { DuelKindPreferenceButton } from './DuelKindPreferenceButton.js';

it('uses the contrasting choice material for selected formats and player counts', () => {
  render(<DuelKindPreferenceButton label="2" checked active onClick={() => {}} />);
  expect(screen.getByRole('button', { name: '2' })).toHaveStyle({
    background: 'var(--liquid-choice-selected-bg, var(--liquid-selected-bg))',
    color: '#fff',
  });
});
