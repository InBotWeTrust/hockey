import { describe, expect, it } from 'vitest';
import { tournamentSlugBase } from '../../src/tournament/slug.js';

describe('tournament slug generation', () => {
  it('builds a readable slug from a Russian tournament title', () => {
    expect(tournamentSlugBase('Кубок Севера 2026')).toBe('kubok-severa-2026');
  });

  it('uses a safe fallback and keeps the database value within 80 characters', () => {
    expect(tournamentSlugBase('🏆🏆🏆')).toBe('tournament');
    expect(tournamentSlugBase('О'.repeat(200))).toHaveLength(80);
  });
});
