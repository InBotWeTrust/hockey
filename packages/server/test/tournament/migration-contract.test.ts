import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../../db/migrations/061_tournaments.sql', import.meta.url);
const concurrencyMigrationUrl = new URL(
  '../../db/migrations/062_tournament_duel_concurrency.sql',
  import.meta.url,
);

describe('tournament migration contract', () => {
  it('creates the complete tournament orchestration schema', async () => {
    const sql = await readFile(migrationUrl, 'utf8');
    const requiredTables = [
      'tournament',
      'tournament_revision',
      'tournament_participant',
      'tournament_matchday',
      'tournament_round',
      'tournament_fixture',
      'tournament_fixture_segment',
      'tournament_daily_result',
      'tournament_standing',
      'tournament_playoff_series',
      'tournament_live_proposal',
      'tournament_dispatch',
      'tournament_adjustment',
      'tournament_economy_event',
    ];

    for (const table of requiredTables) {
      expect(sql).toMatch(new RegExp(`create table ${table}\\s*\\(`, 'i'));
    }
  });

  it('extends duel, currency, settings and push contracts', async () => {
    const sql = await readFile(migrationUrl, 'utf8');

    expect(sql).toContain("source in ('challenge', 'matchmaking', 'tournament')");
    expect(sql).toContain("'tournament_entry_fee'");
    expect(sql).toContain("'tournament_entry_refund'");
    expect(sql).toContain("'tournament_reward'");
    expect(sql).toContain("'tournaments.enabled'");
    expect(sql).toContain('tournament_events boolean not null default true');
    expect(sql).toContain("'tournament'");
  });

  it('keeps the casual one-open-pair invariant without blocking tournament fixtures', async () => {
    const sql = await readFile(concurrencyMigrationUrl, 'utf8');
    expect(sql).toContain("source <> 'tournament'");
    expect(sql).toContain("source = 'tournament'");
  });
});
