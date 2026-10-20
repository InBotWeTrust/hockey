import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { DailyHubScoreboard } from '../screens/DailyScreen.js';
it('centers time and periods in equal columns', () => {
  render(<DailyHubScoreboard activePeriod={1} periodsTotal={3} timer="20:00" timerLabel="Время" ariaLabel="Табло" />);
  expect(screen.getByLabelText('Табло')).toHaveStyle({ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' });
});
