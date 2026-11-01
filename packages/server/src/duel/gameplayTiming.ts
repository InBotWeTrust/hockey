export function createGameplayTiming(clock = () => performance.now()) {
  const started = clock();
  let previous = started;
  const phasesMs: Record<string, number> = {};
  const mark = (phase: string) => {
    const now = clock();
    phasesMs[phase] = Math.round(now - previous);
    previous = now;
  };
  return {
    mark,
    logIfSlow(
      logger: { warn: (fields: object, message: string) => void },
      context: { operation: string; userId?: string },
    ) {
      const totalMs = Math.round(clock() - started);
      if (totalMs < 1000) return;
      mark('response');
      logger.warn({ ...context, totalMs, phasesMs }, 'slow gameplay request');
    },
  };
}
