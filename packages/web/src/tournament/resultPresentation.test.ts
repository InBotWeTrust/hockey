import { describe, expect, it } from 'vitest';
import { tournamentTechnicalReason } from './resultPresentation.js';

describe('technical tournament result reasons', () => {
  it('explains administrative double no-show and disqualification', () => {
    expect(tournamentTechnicalReason('tournament_attempt_both_no_show', 'Home', 'Away'))
      .toBe('Оба игрока не подтвердили участие');
    expect(tournamentTechnicalReason('tournament_disqualification', 'Home', 'Away'))
      .toBe('Дисквалификация участника');
  });
});
