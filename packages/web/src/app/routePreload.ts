/** Warm code only. Access checks and gameplay requests still run on navigation. */
export function scheduleRoutePreload(loaders: readonly (() => Promise<unknown>)[]): () => void {
  const connection = (navigator as Navigator & {
    connection?: {saveData?: boolean; effectiveType?: string};
  }).connection;
  if (connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType ?? '')) {
    return () => undefined;
  }
  let cancelled = false;
  let index = 0;
  let timer: ReturnType<typeof setTimeout>;
  const next = async (): Promise<void> => {
    if (cancelled || index >= loaders.length) return;
    if (document.visibilityState === 'hidden') {
      timer = setTimeout(() => void next(), 1500);
      return;
    }
    try {
      await loaders[index++]!();
    } catch {
      // A speculative load must never break navigation or suppress its normal retry.
    }
    if (!cancelled && index < loaders.length) timer = setTimeout(() => void next(), 500);
  };
  timer = setTimeout(() => void next(), 1500);
  return () => {cancelled = true; clearTimeout(timer);};
}
