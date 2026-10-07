interface Watch {
  subscribers: Set<(data: string) => void>;
  timer: ReturnType<typeof setTimeout> | null;
  last: string | null;
  complete: boolean;
}
/** One read and timer per watched resource, regardless of viewer count. */
export class SnapshotHub {
  private readonly watches = new Map<string, Watch>();
  constructor(
    private readonly load: (key: string) => Promise<unknown>,
    private readonly intervalMs: number,
    private readonly onError: (error: unknown) => void,
  ) {}
  subscribe(key: string, send: (data: string) => void): () => void {
    let watch = this.watches.get(key);
    if (!watch) {
      watch = { subscribers: new Set(), timer: null, last: null, complete: false };
      this.watches.set(key, watch);
      const current = watch;
      watch.timer = setTimeout(() => void this.tick(key, current), 0);
    }
    watch.subscribers.add(send);
    if (watch.last !== null) send(watch.last);
    const current = watch;
    return () => {
      current.subscribers.delete(send);
      if (current.subscribers.size === 0) {
        if (current.timer !== null) clearTimeout(current.timer);
        if (this.watches.get(key) === current) this.watches.delete(key);
      }
    };
  }
  private async tick(key: string, watch: Watch): Promise<void> {
    watch.timer = null;
    try {
      const snapshot = await this.load(key);
      const data = JSON.stringify(snapshot);
      watch.complete =
        typeof snapshot === 'object' &&
        snapshot !== null &&
        'complete' in snapshot &&
        snapshot.complete === true;
      if (this.watches.get(key) !== watch) return;
      if (data !== watch.last) {
        watch.last = data;
        for (const send of watch.subscribers) {
          try {
            send(data);
          } catch (error) {
            this.onError(error);
          }
        }
      }
    } catch (error) {
      this.onError(error);
      if (this.watches.get(key) === watch) {
        watch.last = null;
        for (const send of watch.subscribers) {
          try {
            send(JSON.stringify({ error: 'unavailable' }));
          } catch (sendError) {
            this.onError(sendError);
          }
        }
      }
    } finally {
      if (this.watches.get(key) === watch && watch.subscribers.size > 0 && !watch.complete) {
        watch.timer = setTimeout(() => void this.tick(key, watch), this.intervalMs);
        watch.timer.unref?.();
      }
    }
  }
  close(): void {
    for (const watch of this.watches.values()) {
      if (watch.timer !== null) clearTimeout(watch.timer);
      watch.subscribers.clear();
    }
    this.watches.clear();
  }
}
