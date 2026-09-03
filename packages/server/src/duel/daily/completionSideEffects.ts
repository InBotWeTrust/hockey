const pendingDailyCompletionSideEffects = new Set<Promise<void>>();

export function scheduleDailyCompletionSideEffect(
  effect: () => Promise<void>,
  onError: (error: unknown) => void,
): void {
  const scheduled = effect()
    .catch(onError)
    .finally(() => {
      pendingDailyCompletionSideEffects.delete(scheduled);
    });
  pendingDailyCompletionSideEffects.add(scheduled);
}

export async function waitForDailyCompletionSideEffects(): Promise<void> {
  await Promise.all([...pendingDailyCompletionSideEffects]);
}
