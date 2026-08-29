export function scheduleDailyCompletionSideEffect(
  effect: () => Promise<void>,
  onError: (error: unknown) => void,
): void {
  void effect().catch(onError);
}
