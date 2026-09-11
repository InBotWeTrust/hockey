import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';

interface RatingRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  experience: number;
  goals: number;
  accuracy_key: string;
}

interface RankedViewerRow extends RatingRow {
  place: number;
}

const cursorSchema = z.object({
  experience: z.number().int().nonnegative(),
  goals: z.number().int().nonnegative(),
  accuracy: z.string().regex(/^\d+(?:\.\d+)?$/),
  userId: z.string().uuid(),
  place: z.number().int().positive(),
});

type ExperienceRatingCursor = z.infer<typeof cursorSchema>;

function decodeCursor(value: string): ExperienceRatingCursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    const cursor = cursorSchema.safeParse(parsed);
    if (cursor.success) return cursor.data;
  } catch {
    // Converted to the public API error below.
  }
  throw new AppError('bad_request', 'invalid experience rating cursor', 400);
}

function encodeCursor(cursor: ExperienceRatingCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function toRatingPlayer(row: RankedViewerRow) {
  return {
    place: Number(row.place),
    userId: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    experience: Number(row.experience),
  };
}

export async function listExperienceRating(
  pg: Pool,
  viewerUserId: string,
  options: { limit: number; cursor?: string },
) {
  const cursor = options.cursor === undefined ? null : decodeCursor(options.cursor);
  const page = await pg.query<RatingRow>(
    `select u.id, u.display_name, u.avatar_url, u.experience::int as experience,
            u.lifetime_goals_total::int as goals,
            coalesce(
              u.lifetime_goals_total::numeric / nullif(u.lifetime_shots_total, 0),
              0
            )::text as accuracy_key
       from users u
      where $1::int is null
         or u.experience < $1::int
         or (u.experience = $1::int and u.lifetime_goals_total < $2::int)
         or (
           u.experience = $1::int
           and u.lifetime_goals_total = $2::int
           and coalesce(
             u.lifetime_goals_total::numeric / nullif(u.lifetime_shots_total, 0),
             0
           ) < $3::numeric
         )
         or (
           u.experience = $1::int
           and u.lifetime_goals_total = $2::int
           and coalesce(
             u.lifetime_goals_total::numeric / nullif(u.lifetime_shots_total, 0),
             0
           ) = $3::numeric
           and u.id > $4::uuid
         )
      order by u.experience desc, u.lifetime_goals_total desc,
               coalesce(
                 u.lifetime_goals_total::numeric / nullif(u.lifetime_shots_total, 0),
                 0
               ) desc,
               u.id asc
      limit $5`,
    [
      cursor?.experience ?? null,
      cursor?.goals ?? null,
      cursor?.accuracy ?? null,
      cursor?.userId ?? null,
      options.limit + 1,
    ],
  );

  const viewer = await pg.query<RankedViewerRow>(
    `select viewer.id, viewer.display_name, viewer.avatar_url,
            viewer.experience::int as experience,
            viewer.lifetime_goals_total::int as goals,
            coalesce(
              viewer.lifetime_goals_total::numeric / nullif(viewer.lifetime_shots_total, 0),
              0
            )::text as accuracy_key,
            (1 + count(ahead.id))::int as place
       from users viewer
       left join users ahead
         on ahead.experience > viewer.experience
         or (
           ahead.experience = viewer.experience
           and ahead.lifetime_goals_total > viewer.lifetime_goals_total
         )
         or (
           ahead.experience = viewer.experience
           and ahead.lifetime_goals_total = viewer.lifetime_goals_total
           and coalesce(
             ahead.lifetime_goals_total::numeric / nullif(ahead.lifetime_shots_total, 0),
             0
           ) > coalesce(
             viewer.lifetime_goals_total::numeric / nullif(viewer.lifetime_shots_total, 0),
             0
           )
         )
         or (
           ahead.experience = viewer.experience
           and ahead.lifetime_goals_total = viewer.lifetime_goals_total
           and coalesce(
             ahead.lifetime_goals_total::numeric / nullif(ahead.lifetime_shots_total, 0),
             0
           ) = coalesce(
             viewer.lifetime_goals_total::numeric / nullif(viewer.lifetime_shots_total, 0),
             0
           )
           and ahead.id < viewer.id
         )
      where viewer.id = $1
      group by viewer.id, viewer.display_name, viewer.avatar_url, viewer.experience`,
    [viewerUserId],
  );
  const viewerRow = viewer.rows[0];
  if (viewerRow === undefined) throw new AppError('not_found', 'user not found', 404);

  const hasNextPage = page.rows.length > options.limit;
  const visibleRows = page.rows.slice(0, options.limit).map((row, index) => ({
    ...row,
    place: (cursor?.place ?? 0) + index + 1,
  }));
  const last = visibleRows.at(-1);

  return {
    rows: visibleRows.map(toRatingPlayer),
    nextCursor:
      hasNextPage && last !== undefined
        ? encodeCursor({
            experience: last.experience,
            goals: last.goals,
            accuracy: last.accuracy_key,
            userId: last.id,
            place: last.place,
          })
        : null,
    currentUser: toRatingPlayer(viewerRow),
  };
}
