export type TournamentDraftSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface QueueItem<TSnapshot> {
  snapshot: TSnapshot;
  key: string;
}

interface FlushWaiter<TResult> {
  resolve: (result: TResult | undefined) => void;
  reject: (error: unknown) => void;
}

export class TournamentDraftSaveQueue<TSnapshot, TResult> {
  private revision: number;
  private savedKey: string;
  private pending: QueueItem<TSnapshot> | null = null;
  private active: QueueItem<TSnapshot> | null = null;
  private lastResult: TResult | undefined;
  private failure: unknown = null;
  private waiters: FlushWaiter<TResult>[] = [];
  private currentStatus: TournamentDraftSaveStatus = 'idle';

  constructor(
    private readonly options: {
      initialRevision: number;
      initialSnapshotKey: string;
      save: (snapshot: TSnapshot, expectedRevision: number) => Promise<TResult>;
      revisionOf: (result: TResult) => number;
      onStatusChange?: (status: TournamentDraftSaveStatus, error?: unknown) => void;
      onSaved?: (result: TResult, snapshotKey: string) => void;
    },
  ) {
    this.revision = options.initialRevision;
    this.savedKey = options.initialSnapshotKey;
  }

  get status(): TournamentDraftSaveStatus {
    return this.currentStatus;
  }

  get snapshotKey(): string {
    return this.savedKey;
  }

  enqueue(snapshot: TSnapshot, key: string): void {
    if (key === this.savedKey && this.active === null && this.pending === null) return;
    if (this.active?.key === key) {
      this.pending = null;
      return;
    }
    if (this.pending?.key === key) return;
    const failedKey = this.failure === null ? null : this.pending?.key;
    this.pending = { snapshot, key };
    if (this.failure !== null && key !== failedKey) {
      this.failure = null;
      this.setStatus('saving');
    }
    if (this.failure === null) this.pump();
  }

  flush(): Promise<TResult | undefined> {
    if (this.failure !== null) return Promise.reject(this.failure);
    if (this.active === null && this.pending === null) return Promise.resolve(this.lastResult);
    return new Promise<TResult | undefined>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
      this.pump();
    });
  }

  retry(): void {
    if (this.failure === null) return;
    this.failure = null;
    this.setStatus(this.pending === null ? 'idle' : 'saving');
    this.pump();
  }

  private setStatus(status: TournamentDraftSaveStatus, error?: unknown): void {
    this.currentStatus = status;
    this.options.onStatusChange?.(status, error);
  }

  private pump(): void {
    if (this.active !== null || this.failure !== null) return;
    const item = this.pending;
    if (item === null) {
      if (this.currentStatus === 'saving') this.setStatus('saved');
      this.resolveWaiters();
      return;
    }
    this.pending = null;
    this.active = item;
    this.setStatus('saving');
    void this.options.save(item.snapshot, this.revision).then(
      (result) => {
        this.revision = this.options.revisionOf(result);
        this.savedKey = item.key;
        this.lastResult = result;
        this.active = null;
        this.options.onSaved?.(result, item.key);
        if (this.pending?.key === this.savedKey) this.pending = null;
        if (this.pending === null) this.setStatus('saved');
        this.pump();
      },
      (error: unknown) => {
        this.active = null;
        if (this.pending === null) this.pending = item;
        this.failure = error;
        this.setStatus('error', error);
        this.rejectWaiters(error);
      },
    );
  }

  private resolveWaiters(): void {
    if (this.active !== null || this.pending !== null || this.failure !== null) return;
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) waiter.resolve(this.lastResult);
  }

  private rejectWaiters(error: unknown): void {
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) waiter.reject(error);
  }
}
