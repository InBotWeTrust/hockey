import { z } from 'zod';
import { noviceContextData, noviceResponseData } from './noviceSpoilers.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { BarLayout } from '@hockey/game-core';
import { AppError } from '../plugins/errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    barNovice?: boolean;
  }
}
export const hiddenNoviceCharacters = new Set(['arsenich', 'timofey', 'maria', 'elina']);
export async function isBarNovice(app: FastifyInstance, userId: string): Promise<boolean> {
  const { rows } = await app.pg.query<{ completed: boolean }>(
    'select (amateur_onboarding_completed or amateur_access_preserved) as completed from users where id=$1',
    [userId],
  );
  return rows[0]?.completed !== true;
}
export function registerBarNoviceAccess(app: FastifyInstance) {
  app.decorateRequest('barNovice', false);
  app.addHook('onRoute', (route) => {
    const matchRoute = route.url === '/bar/games/matches/:id';
    const office = ['/bar/staff-room', '/bar/office-presence'].includes(route.url);
    if (
      !matchRoute &&
      !office &&
      !route.url.startsWith('/bar/conversations/') &&
      !['/bar/games/computer', '/bar/card-history', '/bar/games/local-cards'].includes(route.url)
    )
      return;
    if (route.url.startsWith('/bar/conversations/')) {
      const previous = route.preSerialization
        ? Array.isArray(route.preSerialization)
          ? route.preSerialization
          : [route.preSerialization]
        : [];
      route.preSerialization = [
        ...previous,
        async (request, _reply, payload) =>
          request.barNovice ? noviceResponseData(payload) : payload,
      ];
    }
    const existing = route.preHandler
      ? Array.isArray(route.preHandler)
        ? route.preHandler
        : [route.preHandler]
      : [];
    route.preHandler = [
      ...existing,
      async (request: FastifyRequest) => {
        request.barNovice = await isBarNovice(app, request.user.id);
        let character =
          (request.params as { character?: string })?.character ??
          (request.body as { character?: string })?.character;
        if (request.barNovice && matchRoute) {
          const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
          const { rows } = await app.pg.query<{ character: string | null }>(
            'select character from bar_game_matches where id=$1 and (player_a=$2 or player_b=$2)',
            [id, request.user.id],
          );
          character = rows[0]?.character ?? undefined;
        }
        if (
          request.barNovice &&
          (office ||
            route.url === '/bar/games/local-cards' ||
            hiddenNoviceCharacters.has(character ?? ''))
        )
          throw new AppError('bar_character_unavailable', 'Этот собеседник пока недоступен.', 403);
      },
    ];
  });
}
export function noviceBarLayout(source: BarLayout): BarLayout {
  const layout = structuredClone(source);
  layout.profiles = noviceContextData(layout.profiles);
  layout.slots = layout.slots.filter((slot) => !hiddenNoviceCharacters.has(slot.occupantId ?? ''));
  for (const id of ['arsenich', 'timofey', 'maria'] as const)
    layout.profiles[id] = { name: '', role: '', description: '', avatar: null, composition: null };
  if (!layout.slots.some((slot) => slot.id === layout.defaultSlotId))
    layout.defaultSlotId = (layout.slots.find((slot) => slot.occupantId === 'igor') ??
      layout.slots[0])!.id;
  return layout;
}
