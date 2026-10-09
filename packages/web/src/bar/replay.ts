import type { BarShot } from './types.js';
/** Bounded per-player queues; snapshots may overlap or repeat after reconnect. */
export class ReplayBuffer {
  private readonly seen = new Set<string>();
  private readonly queues = new Map<string, BarShot[]>();
  push(shots: BarShot[], initial = false): void {
    for (const shot of shots) {
      if (this.seen.has(shot.id)) continue;
      this.seen.add(shot.id);
      if (!initial) {
        const queue = this.queues.get(shot.userId) ?? [];
        queue.push(shot);
        if (queue.length > 20) queue.splice(0, queue.length - 20);
        this.queues.set(shot.userId, queue);
      }
    }
    while (this.seen.size > 512) this.seen.delete(this.seen.values().next().value!);
  }
  take(userId: string): BarShot | null {
    return this.queues.get(userId)?.shift() ?? null;
  }
  reset(): void {
    this.seen.clear();
    this.queues.clear();
  }
}
