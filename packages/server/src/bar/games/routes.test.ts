import Fastify, { type FastifyRequest } from 'fastify';
import { expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { errorsPlugin as errors } from '../../plugins/errors.js';
import { barGameRoutes } from './routes.js';
import { gameAction, computerCharacter } from './routes.js';
it('rejects impossible inputs before touching persistent state and requires authentication', async () => {
  const app = Fastify();
  const query = vi.fn();
  app.decorate('pg', { query } as unknown as Pool);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    req.user = { id: '00000000-0000-4000-8000-000000000001' };
  });
  await app.register(errors);
  await app.register(barGameRoutes);
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/bar/games/matches/00000000-0000-4000-8000-000000000002',
      payload: {
        requestId: '00000000-0000-4000-8000-000000000003',
        revision: 0,
        action: { type: 'shot', angle: 0, power: 20 },
      },
    });
    expect(response.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
  const unauth = Fastify();
  unauth.decorate('pg', {} as Pool);
  unauth.decorate('authenticate', async () => {
    throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  });
  await unauth.register(barGameRoutes);
  try {
    expect((await unauth.inject('/bar/games/lobby')).statusCode).toBe(401);
  } finally {
    await unauth.close();
  }
});
it('bounds gesture duration, chain length and finite coordinates', () => {
  expect(
    gameAction.safeParse({ type: 'dart', gesture: { dx: 0, dy: -1, durationMs: 1 } }).success,
  ).toBe(false);
  expect(gameAction.safeParse({ type: 'place', point: { x: Infinity, y: 0 } }).success).toBe(false);
  expect(gameAction.safeParse({ type: 'checkers', path: [1] }).success).toBe(false);
});

it('accepts finite bounded shared aim and rejects excessive power', () => {
  expect(gameAction.safeParse({ type: 'aim', angle: 1, power: 0.5 }).success).toBe(true);
  expect(gameAction.safeParse({ type: 'aim', angle: Infinity, power: 0.5 }).success).toBe(false);
  expect(gameAction.safeParse({ type: 'aim', angle: 1, power: 2 }).success).toBe(false);
});
it('validates spin coordinates on shared aim and shots', () => {
  for (const type of ['aim', 'shot']) {
    expect(
      gameAction.safeParse({ type, angle: 0, power: 0.5, spin: { x: 0.3, y: -0.4 } }).success,
    ).toBe(true);
    expect(gameAction.safeParse({ type, angle: 0, power: 0.5, spin: { x: 1, y: 1 } }).success).toBe(
      false,
    );
    expect(
      gameAction.safeParse({ type, angle: 0, power: 0.5, spin: { x: Infinity, y: 0 } }).success,
    ).toBe(false);
  }
});

it('starts new darts matches with Daria while retaining Maria only in stored matches', () => {
  expect(computerCharacter.safeParse('daria').success).toBe(true);
  expect(computerCharacter.safeParse('maria').success).toBe(false);
});

it('accepts bounded arm input and Oleg, but never offers Grigory for free', () => {
  expect(computerCharacter.safeParse('oleg').success).toBe(true);
  expect(computerCharacter.safeParse('grigory').success).toBe(false);
  const input = {
    type: 'arm-input',
    seq: 1,
    supportHeld: true,
    support: 0.5,
    pressing: true,
    wrist: 'inside',
  };
  expect(gameAction.safeParse(input).success).toBe(true);
  expect(gameAction.safeParse({ ...input, support: 2 }).success).toBe(false);
  expect(gameAction.safeParse({ ...input, seq: 0 }).success).toBe(false);
});
it('accepts naval and round-scoped commands while rejecting invalid coordinates and rounds',()=>{
 expect(computerCharacter.safeParse('timofey').success).toBe(true);
 expect(gameAction.safeParse({type:'naval-attack',x:11,y:11,salvo:false,vertical:false}).success).toBe(true);
 expect(gameAction.safeParse({type:'naval-attack',x:12,y:0,salvo:false,vertical:false}).success).toBe(false);
 expect(gameAction.safeParse({type:'ochko-next',round:4}).success).toBe(true);
 expect(gameAction.safeParse({type:'ochko-challenge',round:0}).success).toBe(false);
});

it('accepts fifth-deal commands and rejects deals beyond the match limit', () => {
  for (const type of ['ochko-hit', 'ochko-stand', 'ochko-next', 'ochko-challenge']) {
    const fields = type === 'ochko-hit' || type === 'ochko-stand' ? { seq: 1 } : {};
    expect(gameAction.safeParse({ type, round: 5, ...fields }).success).toBe(true);
    expect(gameAction.safeParse({ type, round: 6, ...fields }).success).toBe(false);
  }
});
