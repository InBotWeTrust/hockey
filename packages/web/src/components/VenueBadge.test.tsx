import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VenueBadge } from './VenueBadge.js';

describe('VenueBadge', () => {
  it.each([
    ['neutral', 'Нейтральное поле'],
    ['home', 'Дома'],
    ['away', 'В гостях'],
  ] as const)('shows the player-facing %s venue label', (role, label) => {
    render(<VenueBadge role={role} />);

    expect(screen.getByLabelText(`Площадка: ${label}`)).toHaveTextContent(label);
  });
});
