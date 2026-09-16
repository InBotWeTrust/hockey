export interface WorkerTickWait {
  promise: Promise<void>;
  timer: NodeJS.Timeout;
}

export function waitForWorkerTick(ms: number): WorkerTickWait {
  let resolve: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  const timer = setTimeout(resolve!, ms);
  return { promise, timer };
}
