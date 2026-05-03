type PwaRegisterOptions = {
  onRegisteredSW?: (swUrl: string, registration?: ServiceWorkerRegistration) => void;
  onOfflineReady?: () => void;
  onNeedRefresh?: () => void;
  onRegisterError?: (error: unknown) => void;
};

export const pwaRegisterMock = {
  needRefresh: false,
  options: undefined as PwaRegisterOptions | undefined,
  updateServiceWorkerCalls: [] as Array<boolean | undefined>,
  reset(): void {
    this.needRefresh = false;
    this.options = undefined;
    this.updateServiceWorkerCalls = [];
  },
};

export function useRegisterSW(options?: PwaRegisterOptions): {
  needRefresh: [boolean, (value: boolean) => void];
  offlineReady: [boolean, (value: boolean) => void];
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
} {
  pwaRegisterMock.options = options;
  return {
    needRefresh: [
      pwaRegisterMock.needRefresh,
      (value: boolean) => {
        pwaRegisterMock.needRefresh = value;
      },
    ],
    offlineReady: [false, () => undefined],
    updateServiceWorker: (reloadPage?: boolean) => {
      pwaRegisterMock.updateServiceWorkerCalls.push(reloadPage);
      return Promise.resolve();
    },
  };
}
