import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  listPlayerTournamentParticipants,
  listPlayerTournaments,
  updateTournamentDraft,
} from '../../src/tournament/service.js';

describe('player tournament catalog', () => {
  it('maps artwork and the authenticated player final place', async () => {
    let queryNumber = 0;
    const query = async () => {
      queryNumber += 1;
      if (queryNumber === 2) {
        return {
          rows: [
            {
              tournament_id: 't1',
              kind: 'championship',
              higher_seed_participant_id: 'participant-1',
              lower_seed_participant_id: 'participant-8',
              winner_participant_id: 'participant-8',
            },
            {
              tournament_id: 't1',
              kind: 'third_place',
              higher_seed_participant_id: 'participant-2',
              lower_seed_participant_id: 'participant-3',
              winner_participant_id: 'participant-3',
            },
          ],
        };
      }
      return {
        rows: [
          {
            id: 't1',
            slug: 'ice-cup',
            title: 'Кубок льда',
            description: '',
            image_url: '/api/media/proxy/tournaments/artwork/ice.webp?token=signed',
            status: 'completed',
            regular_source: 'head_to_head',
            visibility: 'public',
            current_revision: 3,
            published_revision_id: 'revision-3',
            registration_opens_at: null,
            registration_closes_at: null,
            starts_at: null,
            completed_at: new Date('2030-01-02T00:00:00.000Z'),
            cancelled_at: null,
            created_at: new Date('2030-01-01T00:00:00.000Z'),
            updated_at: new Date('2030-01-02T00:00:00.000Z'),
            rules_snapshot: { config: { regularSource: 'head_to_head' } },
            participant_count: 8,
            my_participant_state: 'approved',
            my_participant_id: 'participant-8',
          },
        ],
      };
    };
    const pool = { query } as unknown as Pool;

    const tournaments = await listPlayerTournaments(pool, 'user-1');

    expect(tournaments[0]).toMatchObject({
      imageUrl: '/api/media/proxy/tournaments/artwork/ice.webp?token=signed',
      myParticipantState: 'approved',
      myFinalPlace: 1,
    });
  });

  it('preserves existing artwork when an older PATCH omits imageUrl', async () => {
    let updateSql = '';
    let updateValues: unknown[] = [];
    const tournamentRow = {
      id: 't1',
      slug: 'ice-cup',
      title: 'Кубок льда',
      description: '',
      image_url: '/api/media/existing',
      status: 'draft',
      regular_source: 'head_to_head',
      visibility: 'public',
      current_revision: 2,
      published_revision_id: null,
      registration_opens_at: null,
      registration_closes_at: null,
      starts_at: null,
      completed_at: null,
      cancelled_at: null,
      created_at: new Date('2030-01-01T00:00:00.000Z'),
      updated_at: new Date('2030-01-01T00:00:00.000Z'),
      rules_snapshot: { config: { regularSource: 'head_to_head' } },
      participant_count: 0,
    };
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        if (sql.includes('select status, current_revision')) {
          return { rows: [{ status: 'draft', current_revision: 1 }] };
        }
        if (sql.includes('update tournament')) {
          updateSql = sql;
          updateValues = values ?? [];
        }
        if (sql.includes('from tournament t') && sql.includes('t.id = $1')) {
          return { rows: [tournamentRow] };
        }
        return { rows: [], rowCount: 1 };
      },
      release: () => undefined,
    };
    const pool = { connect: async () => client } as unknown as Pool;

    await updateTournamentDraft(pool, {
      tournamentId: 't1',
      expectedRevision: 1,
      title: 'Кубок льда',
      description: '',
      rules: {
        config: { regularSource: 'head_to_head', visibility: 'public' },
        eligibility: {
          minLevel: null,
          maxLevel: null,
          minGoals: 0,
          minExperience: 0,
          invitedUserIds: [],
          bannedUserIds: [],
        },
      } as never,
      updatedBy: 'admin-1',
      registrationOpensAt: null,
      registrationClosesAt: null,
      startsAt: null,
    });

    expect(updateSql).toContain('case when $4::boolean then $5 else image_url end');
    expect(updateValues[3]).toBe(false);
    expect(updateValues[4]).toBeNull();
  });

  it('returns only approved participants through the player-safe shape', async () => {
    let executedSql = '';
    const pool = {
      query: async (sql: string) => {
        executedSql = sql;
        return {
          rows: [
            {
              user_id: 'user-1',
              display_name: 'Первый',
              avatar_url: '/first.webp',
              seed: 1,
            },
          ],
        };
      },
    } as unknown as Pool;

    const participants = await listPlayerTournamentParticipants(pool, 'tournament-1');

    expect(participants).toEqual([
      { userId: 'user-1', displayName: 'Первый', avatarUrl: '/first.webp', seed: 1 },
    ]);
    expect(executedSql).toContain("p.state = 'approved'");
  });
});
