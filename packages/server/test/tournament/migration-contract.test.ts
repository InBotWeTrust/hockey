import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../../db/migrations/061_tournaments.sql', import.meta.url);
const concurrencyMigrationUrl = new URL(
  '../../db/migrations/062_tournament_duel_concurrency.sql',
  import.meta.url,
);
const manualPushMigrationUrl = new URL(
  '../../db/migrations/063_tournament_manual_push.sql',
  import.meta.url,
);
const liveProposalMigrationUrl = new URL(
  '../../db/migrations/064_tournament_live_proposal_active.sql',
  import.meta.url,
);
const fixtureVenueMigrationUrl = new URL(
  '../../db/migrations/065_tournament_fixture_venue.sql',
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

  it('registers the manual tournament push template', async () => {
    const sql = await readFile(manualPushMigrationUrl, 'utf8');
    expect(sql).toContain("'tournament.manual'");
  });

  it('enforces one pending or accepted live proposal per fixture', async () => {
    const sql = await readFile(liveProposalMigrationUrl, 'utf8');
    expect(sql).toContain("state in ('pending', 'accepted')");
    expect(sql).toContain('tournament_live_one_active_idx');
  });

  it('adds nullable immutable venue fields to tournament fixtures', async () => {
    const sql = await readFile(fixtureVenueMigrationUrl, 'utf8');

    expect(sql).toContain('venue_mode');
    expect(sql).toContain("'home_selected'");
    expect(sql).toContain("'neutral_default'");
    expect(sql).toContain('venue_owner_participant_id');
    expect(sql).toContain('arena_theme_id');
    expect(sql).toContain('arena_snapshot');
  });
});
