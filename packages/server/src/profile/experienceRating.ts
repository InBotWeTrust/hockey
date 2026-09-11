import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';

interface RatingRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  experience: number;
}

interface RankedViewerRow extends RatingRow {
  place: number;
}

const cursorSchema = z.object({
  experience: z.number().int().nonnegative(),
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
    `select u.id, u.display_name, u.avatar_url, u.experience::int as experience
       from users u
      where $1::int is null
         or u.experience < $1::int
         or (u.experience = $1::int and u.id > $2::uuid)
      order by u.experience desc, u.id asc
      limit $3`,
    [cursor?.experience ?? null, cursor?.userId ?? null, options.limit + 1],
  );

  const viewer = await pg.query<RankedViewerRow>(
    `select viewer.id, viewer.display_name, viewer.avatar_url,
            viewer.experience::int as experience,
            (1 + count(ahead.id))::int as place
       from users viewer
       left join users ahead
         on ahead.experience > viewer.experience
         or (ahead.experience = viewer.experience and ahead.id < viewer.id)
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
        ? encodeCursor({ experience: last.experience, userId: last.id, place: last.place })
        : null,
    currentUser: toRatingPlayer(viewerRow),
  };
}
