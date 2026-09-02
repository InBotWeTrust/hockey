import { apiFetch } from './apiFetch.js';

export type OnboardingChainKey = 'beginner' | 'amateur';

export type OnboardingStep =
  | {
      id: string;
      position: number;
      kind: 'informational';
      title: string;
      description: string;
      ctaLabel: string;
      imageUrl: string;
    }
  | {
      id: string;
      position: number;
      kind: 'tutorial_shot';
      title: string;
      description: string;
      ctaLabel: string;
      tutorial: {
        shooterFrequency: number;
        goalieFrequency: number;
        goalFrequency: number;
      };
    };

export interface OnboardingRequired {
  chain: OnboardingChainKey;
  versionId: string;
  steps: OnboardingStep[];
}

export interface OnboardingRequiredResponse {
  required: OnboardingRequired | null;
}

export interface OnboardingRunResponse {
  runId: string;
  required: OnboardingRequired;
}

export const onboardingQueryKeys = {
  required: () => ['onboarding', 'required'] as const,
};

export function fetchRequiredOnboarding(): Promise<OnboardingRequiredResponse> {
  return apiFetch<OnboardingRequiredResponse>('/onboarding/required');
}

export function startOnboarding(clientSessionId: string): Promise<OnboardingRunResponse> {
  return apiFetch<OnboardingRunResponse>('/onboarding/start', {
    method: 'POST',
    body: JSON.stringify({ clientSessionId }),
  });
}

export function recordStepView(runId: string, stepId: string): Promise<{ viewed: true }> {
  return apiFetch<{ viewed: true }>(`/onboarding/runs/${runId}/steps/${stepId}/view`, {
    method: 'POST',
  });
}

export function completeOnboarding(runId: string): Promise<OnboardingRequiredResponse> {
  return apiFetch<OnboardingRequiredResponse>(`/onboarding/runs/${runId}/complete`, {
    method: 'POST',
  });
}
