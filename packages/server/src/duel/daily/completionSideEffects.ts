const pendingDailyCompletionSideEffects = new Set<Promise<void>>();
const defaultScope = {};
const recoveryScopes = new WeakMap<object, Map<string, { dirty: boolean }>>();

export function scheduleDailyCompletionSideEffect(
  effect: () => Promise<void>,
  onError: (error: unknown) => void,
  recoveryKey?: string,
  recoveryScope: object = defaultScope,
): void {
  let keyedEffects = recoveryScopes.get(recoveryScope);
  if (!keyedEffects) {
    keyedEffects = new Map();
    recoveryScopes.set(recoveryScope, keyedEffects);
  }
  const active = recoveryKey === undefined ? undefined : keyedEffects.get(recoveryKey);
  if (active) {
    active.dirty = true;
    return;
  }
  const state = { dirty: false };
  if (recoveryKey !== undefined) keyedEffects.set(recoveryKey, state);
  const scheduled = (async () => {
    try {
      do {
        state.dirty = false;
        try { await effect(); } catch (error) { onError(error); }
        // Requests during a scan may commit new events after its snapshot.
        // A trailing pass retains those events without running concurrent scans.
      } while (state.dirty);
    } finally {
      if (recoveryKey !== undefined) keyedEffects.delete(recoveryKey);
    }
  })().finally(() => pendingDailyCompletionSideEffects.delete(scheduled));
  pendingDailyCompletionSideEffects.add(scheduled);
}

export async function waitForDailyCompletionSideEffects(): Promise<void> {
  while (pendingDailyCompletionSideEffects.size > 0) {
    await Promise.all([...pendingDailyCompletionSideEffects]);
  }
}
