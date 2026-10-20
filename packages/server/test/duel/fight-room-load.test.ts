import { expect, it } from 'vitest';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { createFightState, DEFAULT_FIGHT_RULES } from '@hockey/game-core';
import { FightRoom } from '../../src/duel/amateur/fight/runtime/room.js';

// CPU/queue stress only. Real-socket and durable-settlement tests run separately.
// Never use these numbers as production or end-to-end capacity estimates.
const enabled = process.env.FIGHT_ROOM_LOAD === '1';
const duration = Number(process.env.FIGHT_ROOM_LOAD_SECONDS ?? 90) * 1000;
const warmup = Number(process.env.FIGHT_ROOM_WARMUP_SECONDS ?? 30) * 1000;
for (const count of [10, 50, 100])
  for (const repeat of [1, 2, 3]) {
    it.skipIf(!enabled)(
      `room stress ${count} concurrent, repetition ${repeat}`,
      async () => {
        let serial = 0,
          replacements = 0,
          inputs = 0,
          failures = 0,
          reconnects = 0;
        const make = (at = Date.now()) => ({
          room: new FightRoom(
            `load-${++serial}`,
            createFightState({ ...DEFAULT_FIGHT_RULES, version: 6, deliveryGraceMs: 0 }, at),
          ),
          seq: [0, 0],
          lastInput: 0,
        });
        const rooms = Array.from({ length: count }, () => make());
        const compute: number[] = [],
          queue: number[] = [];
        const expectedRejections: Record<string, number> = {};
        const errors: Record<string, number> = {};
        const loop = monitorEventLoopDelay({ resolution: 10 });
        loop.enable();
        const start = performance.now(),
          cpu = process.cpuUsage();
        await new Promise<void>((resolve, reject) => {
          const timer = setInterval(() => {
            const elapsed = performance.now() - start,
              now = Date.now();
            if (elapsed >= duration) {
              clearInterval(timer);
              resolve();
              return;
            }
            try {
              for (let i = 0; i < rooms.length; i++) {
                let slot = rooms[i]!;
                if (['resolved', 'cancelled'].includes(slot.room.state.status)) {
                  slot = rooms[i] = make(now);
                  replacements++;
                }
                if (now - slot.lastInput >= 150) {
                  slot.lastInput = now;
                  for (const player of [0, 1] as const) {
                    const seq = ++slot.seq[player]!,
                      at = performance.now();
                    const attack = seq % 4 === 0;
                    const body = {
                      type: 'fight:action' as const,
                      fightId: slot.room.fightId,
                      phaseId: slot.room.state.phaseId,
                      seq,
                      actionId: `${player}-${seq}`,
                      ...(attack
                        ? { kind: 'attack' as const, zone: 'head' as const }
                        : {
                            kind: 'input' as const,
                            input: {
                              direction: (seq % 10 < 5 ? 1 : -1) as 1 | -1,
                              crouch: seq % 7 === 0,
                              guard: seq % 3 === 0,
                            },
                          }),
                    };
                    inputs++;
                    void slot.room.enqueue(player, body, now).then(
                      () => {
                        if (elapsed >= warmup) queue.push(performance.now() - at);
                      },
                      (error) => {
                        const reason = error?.details?.reason;
                        if (['late_action', 'old_phase', 'finished'].includes(reason)) {
                          expectedRejections[reason] = (expectedRejections[reason] ?? 0) + 1;
                          // Like the real client, resync after a rejected deadline/phase input.
                          // Rejected admission does not consume a sequence number.
                          slot.seq[player] = slot.room.state.lastSeq[player];
                        } else {
                          failures++;
                          errors[reason] = (errors[reason] ?? 0) + 1;
                        }
                      },
                    );
                    // Repeated delivery models a reconnect replay; never creates an extra attack.
                    if (seq % 20 === 0) {
                      reconnects++;
                      void slot.room.enqueue(player, body, now).catch((error) => {
                        if (
                          !['late_action', 'old_phase', 'finished'].includes(error?.details?.reason)
                        )
                          failures++;
                      });
                    }
                  }
                }
                const at = performance.now();
                slot.room.tick(now);
                if (elapsed >= warmup) compute.push(performance.now() - at);
              }
            } catch (error) {
              clearInterval(timer);
              reject(error);
            }
          }, 10);
        });
        loop.disable();
        const stats = (values: number[]) => {
          values.sort((a, b) => a - b);
          return {
            p50: values[Math.floor(values.length * 0.5)] ?? 0,
            p95: values[Math.floor(values.length * 0.95)] ?? 0,
            p99: values[Math.floor(values.length * 0.99)] ?? 0,
          };
        };
        const cpuUsed = process.cpuUsage(cpu);
        console.info(
          'ROOM_LOAD',
          JSON.stringify({
            count,
            repeat,
            seconds: duration / 1000,
            warmupSeconds: warmup / 1000,
            replacements,
            inputs,
            failures,
            errors,
            expectedRejections,
            reconnects,
            computeMs: stats(compute),
            queueMs: stats(queue),
            eventLoopP99Ms: loop.percentile(99) / 1e6,
            rssMiB: process.memoryUsage().rss / 1048576,
            cpuMs: (cpuUsed.user + cpuUsed.system) / 1000,
          }),
        );
        expect(failures).toBe(0);
        expect(replacements).toBeGreaterThanOrEqual(count);
        expect(stats(queue).p99).toBeLessThan(250);
      },
      duration + 15000,
    );
  }
