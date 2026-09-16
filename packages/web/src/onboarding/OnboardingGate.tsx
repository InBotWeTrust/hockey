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
import { apiFetch } from '../api/apiFetch.js';
import type { ProfileData } from '../screens/profileTypes.js';
import { OnboardingFlow, StartupSplash } from './OnboardingFlow.js';

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

export function OnboardingGate({
  children,
  preparePlayer,
}: {
  children: ReactNode;
  preparePlayer?: () => Promise<void>;
}): JSX.Element {
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
  const [playerReady, setPlayerReady] = useState(preparePlayer === undefined);
  const [playerPreparationError, setPlayerPreparationError] = useState(false);
  const playerPreparationRef = useRef<Promise<void> | null>(null);

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

  const preparePlayerScreen = useCallback((): Promise<void> => {
    if (!preparePlayer) {
      setPlayerReady(true);
      return Promise.resolve();
    }
    if (!playerPreparationRef.current) {
      setPlayerPreparationError(false);
      playerPreparationRef.current = preparePlayer()
        .then(() => {
          setPlayerReady(true);
        })
        .catch((error: unknown) => {
          playerPreparationRef.current = null;
          setPlayerPreparationError(true);
          throw error;
        });
    }
    return playerPreparationRef.current;
  }, [preparePlayer]);

  useEffect(() => {
    if (
      !query.isFetchedAfterMount ||
      query.data?.required !== null ||
      playerReady ||
      playerPreparationError
    ) {
      return;
    }
    void preparePlayerScreen().catch(() => undefined);
  }, [
    playerPreparationError,
    playerReady,
    preparePlayerScreen,
    query.data?.required,
    query.isFetchedAfterMount,
  ]);

  const refreshAfterGameExit = useCallback(async (): Promise<void> => {
    // Query defaults intentionally keep the profile cache for the whole app session.
    // An invalidation alone does not guarantee an inactive profile query refetches,
    // leaving the sporting passport behind the authoritative game result.
    await queryClient.invalidateQueries({ queryKey: ['profile'], refetchType: 'none' });
    await Promise.all([
      apiFetch<ProfileData>('/me', { cache: 'no-store' })
        .then((profile) => queryClient.setQueryData(['profile'], profile))
        .catch(() => undefined),
      queryClient.invalidateQueries({ queryKey: ['inventory'] }),
      queryClient.invalidateQueries({ queryKey: ['achievements'] }),
      queryClient.invalidateQueries({ queryKey: ['weekly-challenge'] }),
      queryClient.invalidateQueries({ queryKey: ['daily', 'history'] }),
      queryClient.invalidateQueries({ queryKey: ['training', 'history'] }),
    ]);
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
    playerPreparationRef.current = null;
    setPlayerReady(preparePlayer === undefined);
    setPlayerPreparationError(false);
  }

  let content: ReactNode;
  if (query.isPending || !query.isFetchedAfterMount) {
    content = <StartupSplash />;
  } else if (query.isError) {
    content = (
      <StartupSplash
        message="Не удалось подготовить игру. Проверьте соединение."
        retry={() => void query.refetch()}
      />
    );
  } else if (query.data.required === null) {
    content = playerReady ? (
      children
    ) : playerPreparationError ? (
      <StartupSplash
        message="Не удалось загрузить данные игрока. Проверьте соединение."
        retry={() => void preparePlayerScreen().catch(() => undefined)}
      />
    ) : (
      <StartupSplash />
    );
  } else if (startError) {
    content = (
      <StartupSplash
        message="Не удалось подготовить онбординг. Проверьте соединение."
        retry={() => {
          setStartError(false);
          void startRequired(sessionIdRef.current)
            .then(setRun)
            .catch(() => setStartError(true));
        }}
      />
    );
  } else if (!run) {
    content = <StartupSplash />;
  } else {
    content = (
      <OnboardingFlow runId={run.runId} required={run.required} onCompleted={acceptCompletion} />
    );
  }

  return (
    <OnboardingGateContext.Provider value={contextValue}>{content}</OnboardingGateContext.Provider>
  );
}
