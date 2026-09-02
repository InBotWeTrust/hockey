import { apiFetch } from '../api/apiFetch.js';
import type {
  OnboardingChainKey,
  OnboardingStep,
  OnboardingTutorialSession,
  OnboardingTutorialShotResponse,
} from '../api/onboarding.js';

export type AdminOnboardingStep =
  | (Extract<OnboardingStep, { kind: 'informational' }> & { mediaObjectId: string })
  | Extract<OnboardingStep, { kind: 'tutorial_shot' }>;

export interface AdminOnboardingVersion {
  id: string;
  status: 'draft' | 'published';
  createdAt: string;
  publishedAt: string | null;
  steps: AdminOnboardingStep[];
}

export interface AdminOnboardingChain {
  chainKey: OnboardingChainKey;
  enforcementEnabled: boolean;
  published: AdminOnboardingVersion | null;
  draft: AdminOnboardingVersion | null;
}

export type AdminOnboardingStepInput =
  | {
      kind: 'informational';
      title: string;
      description: string;
      ctaLabel: string;
      mediaObjectId: string;
    }
  | {
      kind: 'tutorial_shot';
      title: string;
      description: string;
      ctaLabel: string;
      tutorial: { shooterFrequency: number; goalieFrequency: number; goalFrequency: number };
    };

export interface AdminOnboardingPreview {
  preview: true;
  chain: OnboardingChainKey;
  versionId: string;
  steps: OnboardingStep[];
}

export interface AdminOnboardingMedia {
  id: string;
  url: string;
  key: string;
  contentType: 'image/webp';
  size: number;
  originalName: string;
  createdAt: string;
}

export interface AdminOnboardingStatsQuery {
  chain?: OnboardingChainKey;
  versionId?: string;
  from?: string;
  to?: string;
}

export interface AdminOnboardingStats {
  startedUsers: number;
  completedUsers: number;
  completionRate: number;
  averageCompletionSeconds: number | null;
  repeatStarts: number;
  tutorial: {
    averageAttemptsToGoal: number | null;
    firstAttemptGoalRate: number | null;
    maxAttempts: number | null;
  };
  steps: Array<{
    stepId: string;
    position: number;
    title: string;
    reachedUsers: number;
    dropOffUsers: number;
  }>;
}

async function chainMutation(path: string, init: RequestInit): Promise<AdminOnboardingChain> {
  const response = await apiFetch<{ chain: AdminOnboardingChain }>(path, init);
  return response.chain;
}

export async function fetchOnboardingChain(
  chainKey: OnboardingChainKey,
): Promise<AdminOnboardingChain> {
  const response = await apiFetch<{ chain: AdminOnboardingChain }>(
    `/admin/onboarding/chains/${chainKey}`,
  );
  return response.chain;
}

export function createOnboardingStep(
  chainKey: OnboardingChainKey,
  input: AdminOnboardingStepInput,
): Promise<AdminOnboardingChain> {
  return chainMutation(`/admin/onboarding/chains/${chainKey}/steps`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function patchOnboardingStep(
  chainKey: OnboardingChainKey,
  stepId: string,
  input: AdminOnboardingStepInput,
): Promise<AdminOnboardingChain> {
  return chainMutation(`/admin/onboarding/chains/${chainKey}/steps/${stepId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function duplicateOnboardingStep(
  chainKey: OnboardingChainKey,
  stepId: string,
): Promise<AdminOnboardingChain> {
  return chainMutation(`/admin/onboarding/chains/${chainKey}/steps/${stepId}/duplicate`, {
    method: 'POST',
  });
}

export function deleteOnboardingStep(
  chainKey: OnboardingChainKey,
  stepId: string,
): Promise<AdminOnboardingChain> {
  return chainMutation(`/admin/onboarding/chains/${chainKey}/steps/${stepId}`, {
    method: 'DELETE',
  });
}

export function reorderOnboardingSteps(
  chainKey: OnboardingChainKey,
  stepIds: string[],
): Promise<AdminOnboardingChain> {
  return chainMutation(`/admin/onboarding/chains/${chainKey}/reorder`, {
    method: 'POST',
    body: JSON.stringify({ stepIds }),
  });
}

export function publishOnboardingDraft(
  chainKey: OnboardingChainKey,
): Promise<AdminOnboardingChain> {
  return chainMutation(`/admin/onboarding/chains/${chainKey}/publish`, { method: 'POST' });
}

export async function uploadOnboardingImage(file: File): Promise<AdminOnboardingMedia> {
  if (file.size === 0) throw new Error('Файл пустой');
  if (file.type !== 'image/webp' && !file.name.toLowerCase().endsWith('.webp')) {
    throw new Error('Только WebP');
  }
  const response = await apiFetch<{ media: AdminOnboardingMedia }>('/admin/onboarding/media', {
    method: 'POST',
    headers: { 'content-type': 'image/webp', 'x-file-name': file.name },
    body: file,
  });
  return response.media;
}

export function fetchOnboardingPreview(
  chainKey: OnboardingChainKey,
): Promise<AdminOnboardingPreview> {
  return apiFetch<AdminOnboardingPreview>(`/admin/onboarding/chains/${chainKey}/preview`);
}

export function startOnboardingPreviewTutorial(
  chainKey: OnboardingChainKey,
): Promise<OnboardingTutorialSession & { runId: string }> {
  return apiFetch(`/admin/onboarding/chains/${chainKey}/preview/tutorial/start`, {
    method: 'POST',
  });
}

export function submitOnboardingPreviewTutorialShot(
  runId: string,
  shot: {
    shotIndex: number;
    input: { tapTime: number; shooterTapTime: number };
    claimedResult: 'goal' | 'save' | 'miss';
  },
): Promise<OnboardingTutorialShotResponse> {
  return apiFetch(`/admin/onboarding/preview/runs/${runId}/tutorial/shot`, {
    method: 'POST',
    body: JSON.stringify(shot),
  });
}

export function fetchOnboardingStats(
  query: AdminOnboardingStatsQuery = {},
): Promise<AdminOnboardingStats> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const suffix = params.toString();
  return apiFetch(`/admin/onboarding/stats${suffix ? `?${suffix}` : ''}`);
}
