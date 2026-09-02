import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchRequiredOnboarding,
  onboardingQueryKeys,
  startOnboarding,
  type OnboardingRequiredResponse,
  type OnboardingRunResponse,
} from '../api/onboarding.js';
import { OnboardingFlow, OnboardingStatus } from './OnboardingFlow.js';

interface OnboardingGateValue {
  refreshAfterGameExit(): Promise<void>;
}

const defaultGateValue: OnboardingGateValue = {
  refreshAfterGameExit: async () => undefined,
};

export const OnboardingGateContext = createContext<OnboardingGateValue>(defaultGateValue);

export function useOnboardingGate(): OnboardingGateValue {
  return useContext(OnboardingGateContext);
}

export function OnboardingGate({ children }: { children: ReactNode }): JSX.Element {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: onboardingQueryKeys.required(),
    queryFn: fetchRequiredOnboarding,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnMount: 'always',
  });
  const sessionIdRef = useRef(crypto.randomUUID());
  const startPromiseRef = useRef<Promise<OnboardingRunResponse> | null>(null);
  const [run, setRun] = useState<OnboardingRunResponse | null>(null);
  const [startError, setStartError] = useState(false);

  const startRequired = useCallback((sessionId: string): Promise<OnboardingRunResponse> => {
    if (!startPromiseRef.current) {
      startPromiseRef.current = startOnboarding(sessionId).catch((error: unknown) => {
        startPromiseRef.current = null;
        throw error;
      });
    }
    return startPromiseRef.current;
  }, []);

  useEffect(() => {
    if (!query.isFetchedAfterMount || !query.data?.required || run) return;
    setStartError(false);
    void startRequired(sessionIdRef.current)
      .then(setRun)
      .catch(() => setStartError(true));
  }, [query.data?.required, query.isFetchedAfterMount, run, startRequired]);

  const refreshAfterGameExit = useCallback(async (): Promise<void> => {
    const response = await fetchRequiredOnboarding();
    queryClient.setQueryData(onboardingQueryKeys.required(), response);
    if (!response.required) return;

    sessionIdRef.current = crypto.randomUUID();
    startPromiseRef.current = null;
    setRun(null);
    setStartError(false);
    try {
      setRun(await startRequired(sessionIdRef.current));
    } catch (error) {
      setStartError(true);
      throw error;
    }
  }, [queryClient, startRequired]);

  const contextValue = useMemo(() => ({ refreshAfterGameExit }), [refreshAfterGameExit]);

  function acceptCompletion(result: OnboardingRequiredResponse): void {
    queryClient.setQueryData(onboardingQueryKeys.required(), result);
    setRun(null);
    startPromiseRef.current = null;
  }

  let content: ReactNode;
  if (query.isPending || !query.isFetchedAfterMount) {
    content = <OnboardingStatus message="Проверяем прогресс…" />;
  } else if (query.isError) {
    content = (
      <OnboardingStatus
        message="Не удалось проверить онбординг. Проверьте соединение."
        retry={() => void query.refetch()}
      />
    );
  } else if (query.data.required === null) {
    content = children;
  } else if (startError) {
    content = (
      <OnboardingStatus
        message="Не удалось начать онбординг. Проверьте соединение."
        retry={() => {
          setStartError(false);
          void startRequired(sessionIdRef.current)
            .then(setRun)
            .catch(() => setStartError(true));
        }}
      />
    );
  } else if (!run) {
    content = <OnboardingStatus message="Загружаем онбординг…" />;
  } else {
    content = (
      <OnboardingFlow runId={run.runId} required={run.required} onCompleted={acceptCompletion} />
    );
  }

  return (
    <OnboardingGateContext.Provider value={contextValue}>{content}</OnboardingGateContext.Provider>
  );
}
