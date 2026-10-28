interface Entry {
  run: () => Promise<unknown>;
  resolve: (value: unknown | null) => void;
  reject: (error: unknown) => void;
}

/** One request on the wire, with a bounded locally simulated lookahead. */
export class ShotSubmissionQueue {
  private active: Entry | null = null;
  private waiting: Entry[] = [];

  constructor(private readonly changed: (pending: number) => void) {}

  get pending(): number {
    return this.waiting.length + (this.active ? 1 : 0);
  }

  enqueue<T>(run: () => Promise<T | null>): Promise<T | null> {
    const result = new Promise<T | null>((resolve, reject) => {
      this.waiting.push({ run, resolve: (value) => resolve(value as T | null), reject });
    });
    this.changed(this.pending);
    this.drain();
    return result;
  }

  cancel(): void {
    const entries = [...(this.active ? [this.active] : []), ...this.waiting];
    this.active = null;
    this.waiting = [];
    this.changed(0);
    for (const entry of entries) entry.resolve(null);
  }

  private drain(): void {
    if (this.active || !this.waiting.length) return;
    const entry = this.waiting.shift()!;
    this.active = entry;
    // Synchronous throws are handled in the same way as failed HTTP requests.
    let task: Promise<unknown>;
    try {
      task = entry.run();
    } catch (error) {
      task = Promise.reject(error);
    }
    void task.then(
      (value) => this.complete(entry, value),
      (error) => this.complete(entry, null, error),
    );
  }

  private complete(entry: Entry, value: unknown, error?: unknown): void {
    if (this.active !== entry) return; // An old match/period was cancelled.
    this.active = null;
    if (value === null || error !== undefined) {
      const abandoned = this.waiting;
      this.waiting = [];
      this.changed(0);
      for (const next of abandoned) next.resolve(null);
    } else {
      this.changed(this.pending);
    }
    if (error !== undefined) entry.reject(error);
    else entry.resolve(value);
    // Give the acknowledgement owner a chance to apply its state first.
    queueMicrotask(() => this.drain());
  }
}
