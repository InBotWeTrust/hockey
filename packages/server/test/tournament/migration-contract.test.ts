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
const enableTournamentsMigrationUrl = new URL(
  '../../db/migrations/066_enable_tournaments.sql',
  import.meta.url,
);
const tournamentArtworkMigrationUrl = new URL(
  '../../db/migrations/067_tournament_artwork.sql',
  import.meta.url,
);
const tournamentClassicMigrationUrl = new URL(
  '../../db/migrations/075_tournament_classic.sql',
  import.meta.url,
);
const playoffSchedulingMigrationUrl = new URL(
  '../../db/migrations/082_tournament_playoff_scheduling.sql',
  import.meta.url,
);
const adminAttentionNotificationMigrationUrl = new URL(
  '../../db/migrations/087_tournament_admin_attention_notification.sql',
  import.meta.url,
);
const playoffScheduleMissingNotificationMigrationUrl = new URL(
  '../../db/migrations/088_tournament_playoff_schedule_missing_notification.sql',
  import.meta.url,
);
const sequentialPlayoffScheduleMigrationUrl = new URL(
  '../../db/migrations/090_tournament_sequential_playoff_schedule.sql',
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

  it('does not drop and rescan the duel venue constraint on an idempotent rerun', async () => {
    const sql = await readFile(fixtureVenueMigrationUrl, 'utf8');

    expect(sql).toContain("position('home_selected' in pg_get_constraintdef(oid)) = 0");
    expect(sql).toContain('not valid');
    expect(sql).toMatch(
      /alter table amateur_duel_match\s+validate constraint amateur_duel_match_venue_policy_check/,
    );
  });

  it('enables the public tournament API through an idempotent setting migration', async () => {
    const sql = await readFile(enableTournamentsMigrationUrl, 'utf8');

    expect(sql).toContain("'tournaments.enabled'");
    expect(sql).toContain("'true'::jsonb");
    expect(sql).toContain('on conflict (key) do update');
  });

  it('adds optional tournament artwork without rewriting existing rows', async () => {
    const sql = await readFile(tournamentArtworkMigrationUrl, 'utf8');

    expect(sql).toMatch(/alter table tournament\s+add column if not exists image_url text/i);
    expect(sql).not.toMatch(/drop\s+(column|table)/i);
  });

  it('adds isolated classic sessions with idempotent constraints', async () => {
    const sql = await readFile(tournamentClassicMigrationUrl, 'utf8');

    expect(sql).toContain('create table if not exists tournament_classic_session');
    expect(sql).toContain('create table if not exists tournament_classic_period');
    expect(sql).toContain('unique (tournament_id, participant_id, tournament_day)');
    expect(sql).toContain('tournament_classic_session_id');
    expect(sql).toContain("'tournament_classic'");
    expect(sql).not.toMatch(/drop\s+(column|table)/i);
  });

  it('adds idempotent playoff game-day, readiness, incident, and forced-decision persistence', async () => {
    const sql = await readFile(playoffSchedulingMigrationUrl, 'utf8');

    for (const table of [
      'tournament_round_game_day',
      'tournament_fixture_attempt',
      'tournament_next_game_choice',
      'tournament_incident',
      'tournament_series_admin_decision',
    ]) {
      expect(sql).toMatch(new RegExp(`create table if not exists ${table}\\s*\\(`, 'i'));
    }

    expect(sql).toContain('unique (round_id, day_number)');
    expect(sql).toContain('unique (round_id, local_date)');
    expect(sql).toContain("status in ('scheduled', 'open', 'closed', 'cancelled')");
    expect(sql).toContain("readiness_duration between interval '1 minute' and interval '2 hours'");
    expect(sql).toContain(
      "planned_start_interval between interval '1 minute' and interval '24 hours'",
    );
    expect(sql).toContain('max_result_bearing_games between 1 and 127');

    expect(sql).toContain("kind text not null check (kind in ('initial', 'replay'))");
    expect(sql).toContain(
      "status text not null default 'pending' check (status in (\n      'pending', 'ready_check', 'active', 'settled', 'technical_result',\n      'needs_reschedule', 'needs_admin_decision', 'cancelled'\n    ))",
    );
    expect(sql).toContain('unique (fixture_id, attempt_number)');
    expect(sql).toContain('amateur_duel_match_id uuid unique');
    expect(sql).toContain(
      "where status in ('pending', 'ready_check', 'active', 'needs_reschedule', 'needs_admin_decision')",
    );
    expect(sql).toContain(
      "check ((kind = 'initial' and is_result_bearing) or (kind = 'replay' and not is_result_bearing))",
    );

    expect(sql).toContain("choice text not null check (choice in ('immediate', 'scheduled'))");
    expect(sql).toContain('unique (fixture_attempt_id, participant_id)');
    expect(sql).toContain(
      "kind text not null check (kind in ('both_no_show', 'both_incomplete', 'regular_replay_readiness_unresolved'))",
    );
    expect(sql).toContain(
      "status text not null default 'open' check (status in ('open', 'resolved'))",
    );
    expect(sql).toContain('tournament_incident_one_open_attempt_kind_idx');
    expect(sql).toContain("where status = 'open'");

    expect(sql).toContain("reason text not null check (btrim(reason) <> '')");
    expect(sql).toContain(
      "status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled'))",
    );
    expect(sql).toContain('tournament_series_admin_decision_one_confirmed_idx');
    expect(sql).toContain("where status = 'confirmed'");

    for (const index of [
      'tournament_round_game_day_round_local_date_idx',
      'tournament_fixture_attempt_schedule_idx',
      'tournament_fixture_attempt_deadline_idx',
      'tournament_incident_series_status_idx',
    ]) {
      expect(sql).toContain(index);
    }
    expect(sql).not.toMatch(/drop\s+(column|table)/i);
  });

  it('adds idempotent tournament admin-attention notification templates', async () => {
    const sql = await readFile(adminAttentionNotificationMigrationUrl, 'utf8');

    expect(sql).toContain("'tournament.registration_blocked'");
    expect(sql).toContain("'tournament.playoff_blocked'");
    expect(sql).toContain("'tournament'");
    expect(sql).toContain("'/admin'");
    expect(sql).toContain('on conflict (key) do nothing');
    expect(sql).not.toMatch(/drop\s+(column|table)/i);
  });

  it('adds an idempotent notification template for missing playoff schedule dates', async () => {
    const sql = await readFile(playoffScheduleMissingNotificationMigrationUrl, 'utf8');

    expect(sql).toContain("'tournament.playoff_schedule_missing'");
    expect(sql).toContain('Настройте расписание плей-офф');
    expect(sql).toContain('Укажите даты и время игр плей-офф');
    expect(sql).toContain("'/admin'");
    expect(sql).toContain('on conflict (key) do nothing');
    expect(sql).not.toMatch(/drop\s+(column|table)/i);
  });

  it('adds an idempotent event-driven inter-game break without removing legacy schedule data', async () => {
    const sql = await readFile(sequentialPlayoffScheduleMigrationUrl, 'utf8');

    expect(sql).toMatch(
      /alter table tournament_round_game_day\s+add column if not exists inter_game_break_duration interval/i,
    );
    expect(sql).toContain(
      "inter_game_break_duration between interval '1 minute' and interval '30 minutes'",
    );
    expect(sql).not.toMatch(/drop\s+(column|table)/i);
  });
});
