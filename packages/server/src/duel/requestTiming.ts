import type { FastifyReply, FastifyRequest } from 'fastify';

export interface GameplayRequestTiming {
  phase(name: string): void;
  identify(context: { matchId: string; userId: string; shotIndex: number }): void;
}

// Route-local hooks cover authentication, the handler, errors and serialization.
// They do not add database calls or retain request bodies, headers or SQL.
export function createGameplayRequestTiming(operation: string, clock = () => performance.now()) {
  const requests = new WeakMap<
    FastifyRequest,
    {
      started: number;
      current: string;
      previous: number;
      phasesMs: Record<string, number>;
      context: Partial<{ matchId: string; userId: string; shotIndex: number }>;
      timing: GameplayRequestTiming;
    }
  >();

  return {
    onRequest: async (request: FastifyRequest): Promise<void> => {
      const started = clock();
      const state = {
        started,
        previous: started,
        current: 'request_setup',
        phasesMs: {} as Record<string, number>,
        context: {} as Partial<{ matchId: string; userId: string; shotIndex: number }>,
        timing: {} as GameplayRequestTiming,
      };
      state.timing = {
        phase(name) {
          const now = clock();
          state.phasesMs[state.current] =
            (state.phasesMs[state.current] ?? 0) + now - state.previous;
          state.previous = now;
          state.current = name;
        },
        identify(context) {
          state.context = {
            matchId: context.matchId,
            userId: context.userId,
            shotIndex: context.shotIndex,
          };
        },
      };
      requests.set(request, state);
    },
    forRequest(request: FastifyRequest): GameplayRequestTiming {
      return requests.get(request)!.timing;
    },
    onResponse: async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const state = requests.get(request);
      if (!state) return;
      requests.delete(request);
      const now = clock();
      const totalMs = Math.round(now - state.started);
      if (totalMs < 1000) return;
      state.phasesMs[state.current] = (state.phasesMs[state.current] ?? 0) + now - state.previous;
      try {
        request.log.warn(
          {
            operation,
            ...state.context,
            statusCode: reply.statusCode,
            totalMs,
            phasesMs: Object.fromEntries(
              Object.entries(state.phasesMs).map(([name, ms]) => [name, Math.round(ms)]),
            ),
          },
          'slow gameplay request',
        );
      } catch {
        // Diagnostics must never affect a successful shot or replace its error.
      }
    },
  };
}
